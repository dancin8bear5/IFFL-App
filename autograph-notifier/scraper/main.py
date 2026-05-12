"""
Music City Autograph Show — attendee change detector.

Fetches the price list page daily, diffs against the last known state,
generates one-sentence bios via Claude for any new names, writes a text
file, and sends a push notification via ntfy.sh.
"""

import os
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup
import anthropic

DATA_FILE = Path(__file__).parent.parent / "data" / "known_attendees.json"
OUTPUT_DIR = Path(__file__).parent.parent / "output"
TARGET_URL = "https://musiccityautographshow.com/pages/price-list"

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Cache-Control": "max-age=0",
}

# Words that appear on the page but are never person names
NON_NAME_WORDS = {
    "The", "And", "With", "For", "From", "Price", "List", "Show",
    "Music", "City", "Autograph", "Nashville", "Sports", "Card",
    "Contact", "More", "Info", "Click", "Here", "View", "All",
    "Buy", "Now", "Sign", "Up", "Log", "In", "Home", "About",
    "Shop", "Cart", "Menu", "Search", "Sale", "New", "Featured",
    "VIP", "Package", "Session", "Table", "Reserved", "Tickets",
    "Purchase", "Available", "Sold", "Out",
}


# ---------------------------------------------------------------------------
# Page fetching
# ---------------------------------------------------------------------------

def _fetch_with_requests() -> str:
    session = requests.Session()
    resp = session.get(TARGET_URL, headers=BROWSER_HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.text


def _fetch_with_playwright() -> str:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(TARGET_URL, wait_until="networkidle", timeout=30_000)
        content = page.content()
        browser.close()
    return content


def fetch_page() -> str:
    try:
        html = _fetch_with_requests()
        print("Fetched page via requests")
        return html
    except Exception as exc:
        print(f"requests failed ({exc}), falling back to Playwright", file=sys.stderr)
        return _fetch_with_playwright()


# ---------------------------------------------------------------------------
# Name extraction
# ---------------------------------------------------------------------------

def _clean_price_suffix(text: str) -> str:
    """Strip trailing price info like '- $150' or '— $50 per item'."""
    return re.sub(r"[-–—]?\s*\$[\d,]+.*", "", text).strip()


def _is_likely_name(text: str) -> bool:
    """Return True if the text looks like a person's name."""
    text = _clean_price_suffix(text)
    text = re.sub(r"\s+", " ", text).strip()

    if not text or len(text) < 4 or len(text) > 50:
        return False

    words = text.split()
    if not (2 <= len(words) <= 5):
        return False

    # Every word must start with a capital letter
    if not all(w[0].isupper() for w in words if w):
        return False

    # No digits
    if any(c.isdigit() for c in text):
        return False

    # Reject if the set of words overlaps common non-name tokens
    if set(words) & NON_NAME_WORDS:
        return False

    return True


def extract_names(html: str) -> list[str]:
    soup = BeautifulSoup(html, "lxml")

    # Strip boilerplate
    for tag in soup(["script", "style", "nav", "header", "footer", "noscript"]):
        tag.decompose()

    # Prefer Shopify RTE content div; fall back to wider containers
    content = (
        soup.find(class_="rte")
        or soup.find(class_="page-content")
        or soup.find(class_=re.compile(r"(page|content|article)", re.I))
        or soup.find("article")
        or soup.find("main")
        or soup.body
        or soup
    )

    names: set[str] = set()
    for tag in content.find_all(["h1", "h2", "h3", "h4", "h5", "strong", "b", "li", "p"]):
        raw = tag.get_text(separator=" ", strip=True)
        cleaned = _clean_price_suffix(raw)
        if _is_likely_name(cleaned):
            names.add(" ".join(cleaned.split()))

    return sorted(names)


# ---------------------------------------------------------------------------
# State persistence
# ---------------------------------------------------------------------------

def load_known() -> set[str]:
    if DATA_FILE.exists():
        data = json.loads(DATA_FILE.read_text())
        return set(data.get("attendees", []))
    return set()


def save_known(names: set[str]) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(
        json.dumps(
            {
                "attendees": sorted(names),
                "last_checked": datetime.now(timezone.utc).isoformat(),
            },
            indent=2,
        )
    )


# ---------------------------------------------------------------------------
# Bio generation
# ---------------------------------------------------------------------------

def generate_bio(client: anthropic.Anthropic, name: str) -> str:
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=120,
        messages=[
            {
                "role": "user",
                "content": (
                    f"In exactly one sentence, who is {name}? "
                    "Focus on their sport or field and their single most notable achievement. "
                    "Do not start the sentence with their name."
                ),
            }
        ],
    )
    return msg.content[0].text.strip()


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def write_output(new_names_bios: list[tuple[str, str]]) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now().strftime("%Y-%m-%d")
    out_path = OUTPUT_DIR / f"new_attendees_{date_str}.txt"

    lines = [
        f"New Attendees Detected — {date_str}",
        "=" * 45,
        "",
    ]
    for name, bio in new_names_bios:
        lines.append(f"{name} — {bio}")

    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    return out_path


def send_notification(topic: str, count: int, names: list[str]) -> None:
    preview = ", ".join(names[:3])
    if count > 3:
        preview += f" (+{count - 3} more)"
    message = f"Music City Show: {count} new attendee(s) — {preview}"
    try:
        requests.post(
            f"https://ntfy.sh/{topic}",
            data=message.encode("utf-8"),
            headers={
                "Title": "Autograph Show Update",
                "Priority": "default",
                "Tags": "stadium",
            },
            timeout=10,
        )
        print(f"Notification sent: {message}")
    except Exception as exc:
        print(f"Notification failed: {exc}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    html = fetch_page()
    current_names = set(extract_names(html))
    print(f"Found {len(current_names)} candidate names on page")

    known_names = load_known()
    new_names = current_names - known_names

    if not new_names:
        print("No new attendees detected. Exiting silently.")
        return

    print(f"New attendees: {sorted(new_names)}")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if api_key:
        client = anthropic.Anthropic(api_key=api_key)
        new_names_bios = []
        for name in sorted(new_names):
            bio = generate_bio(client, name)
            new_names_bios.append((name, bio))
            print(f"  {name} — {bio}")
    else:
        print("Warning: ANTHROPIC_API_KEY not set — skipping bio generation", file=sys.stderr)
        new_names_bios = [(name, "Bio unavailable — set ANTHROPIC_API_KEY.") for name in sorted(new_names)]

    write_output(new_names_bios)

    ntfy_topic = os.environ.get("NTFY_TOPIC")
    if ntfy_topic:
        send_notification(ntfy_topic, len(new_names), [n for n, _ in new_names_bios])
    else:
        print("NTFY_TOPIC not set — skipping push notification")

    save_known(current_names)
    print("State updated.")


if __name__ == "__main__":
    main()
