"""
Music City Autograph Show — attendee change detector.

Captures the show's site (full page + individual large images) with Playwright,
asks Claude vision to read celebrity/athlete names from the images, diffs
against the last known state, generates one-sentence bios for any new names,
writes a text file, and sends a push notification via ntfy.sh.
"""

import os
import json
import sys
import base64
from datetime import datetime, timezone
from pathlib import Path

import requests
import anthropic

DATA_FILE = Path(__file__).parent.parent / "data" / "known_attendees.json"
OUTPUT_DIR = Path(__file__).parent.parent / "output"
TARGET_URLS = [
    "https://musiccityautographshow.com/",
    "https://musiccityautographshow.com/pages/price-list",
]

VISION_MODEL = "claude-sonnet-4-6"
BIO_MODEL = "claude-haiku-4-5-20251001"
MAX_IMAGES_PER_REQUEST = 12
MIN_IMG_SIZE_PX = 240

EXTRACT_PROMPT = (
    "I'm showing you several images captured from a sports card / autograph "
    "show website: the first is the full page screenshot, the rest are "
    "zoomed-in views of individual graphics from the same page.\n\n"
    "Across ALL of the images, list EVERY person who appears to be a featured "
    "guest/signer at the show — celebrities, athletes, musicians, actors, or "
    "other public figures. Names may be plain text OR embedded inside graphics.\n\n"
    "Be exhaustive. Check every image carefully. The same name may appear in "
    "multiple images — list it only once.\n\n"
    "Exclude: show staff, founders, vendors, sponsors, contact people, "
    "business names, dates, locations, or anything that isn't a person's "
    "full name.\n\n"
    "Respond with one full name per line. No numbering, no bullets, no extra "
    "commentary. If zero names appear anywhere, respond with exactly: NONE"
)


def _capture_views(url: str) -> list[bytes]:
    from playwright.sync_api import sync_playwright
    views: list[bytes] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.goto(url, wait_until="networkidle", timeout=45_000)
        page.wait_for_timeout(2000)

        views.append(page.screenshot(full_page=True, type="png"))

        img_handles = page.query_selector_all("img")
        for img in img_handles:
            if len(views) >= MAX_IMAGES_PER_REQUEST:
                break
            try:
                box = img.bounding_box()
                if not box:
                    continue
                if box["width"] < MIN_IMG_SIZE_PX or box["height"] < MIN_IMG_SIZE_PX:
                    continue
                img.scroll_into_view_if_needed(timeout=3000)
                page.wait_for_timeout(250)
                views.append(img.screenshot(type="png"))
            except Exception:
                continue

        browser.close()
    return views


def extract_names_via_vision(client: anthropic.Anthropic, views: list[bytes]) -> list[str]:
    content: list[dict] = []
    for view in views[:MAX_IMAGES_PER_REQUEST]:
        image_b64 = base64.standard_b64encode(view).decode("utf-8")
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/png", "data": image_b64},
        })
    content.append({"type": "text", "text": EXTRACT_PROMPT})

    msg = client.messages.create(
        model=VISION_MODEL,
        max_tokens=1000,
        messages=[{"role": "user", "content": content}],
    )
    text = msg.content[0].text.strip()
    if text.upper() == "NONE":
        return []
    names = [line.strip() for line in text.splitlines() if line.strip()]
    cleaned = []
    for n in names:
        if 4 <= len(n) <= 60 and " " in n and not any(c.isdigit() for c in n):
            cleaned.append(n)
    return sorted(set(cleaned))


def load_known() -> set[str]:
    if DATA_FILE.exists():
        try:
            data = json.loads(DATA_FILE.read_text())
            return set(data.get("attendees", []))
        except json.JSONDecodeError:
            print("Warning: known_attendees.json is malformed, treating as empty", file=sys.stderr)
            return set()
    return set()


def save_known(names: set[str]) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(
        json.dumps(
            {"attendees": sorted(names), "last_checked": datetime.now(timezone.utc).isoformat()},
            indent=2,
        )
    )


def generate_bio(client: anthropic.Anthropic, name: str) -> str:
    msg = client.messages.create(
        model=BIO_MODEL,
        max_tokens=120,
        messages=[{
            "role": "user",
            "content": (
                f"In exactly one sentence, who is {name}? "
                "Focus on their sport or field and their single most notable achievement. "
                "Do not start the sentence with their name."
            ),
        }],
    )
    return msg.content[0].text.strip()


def write_output(new_names_bios: list[tuple[str, str]]) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now().strftime("%Y-%m-%d")
    out_path = OUTPUT_DIR / f"new_attendees_{date_str}.txt"
    lines = [f"New Attendees Detected — {date_str}", "=" * 45, ""]
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
            headers={"Title": "Autograph Show Update", "Priority": "default", "Tags": "stadium"},
            timeout=10,
        )
        print(f"Notification sent: {message}")
    except Exception as exc:
        print(f"Notification failed: {exc}", file=sys.stderr)


def main() -> None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY not set — vision extraction requires it", file=sys.stderr)
        sys.exit(1)
    client = anthropic.Anthropic(api_key=api_key)

    current_names: set[str] = set()
    for url in TARGET_URLS:
        print(f"Capturing views from {url}")
        try:
            views = _capture_views(url)
            print(f"  {len(views)} views captured (full page + {len(views)-1} large images)")
        except Exception as exc:
            print(f"  failed to capture {url}: {exc}", file=sys.stderr)
            continue
        try:
            found = extract_names_via_vision(client, views)
            print(f"  Claude vision found {len(found)} names: {found}")
            current_names |= set(found)
        except Exception as exc:
            print(f"  vision extraction failed for {url}: {exc}", file=sys.stderr)
            continue

    print(f"Total {len(current_names)} unique names across all pages: {sorted(current_names)}")

    known_names = load_known()
    new_names = current_names - known_names

    if not new_names:
        print("No new attendees detected. Exiting silently.")
        save_known(current_names if current_names else known_names)
        return

    print(f"New attendees: {sorted(new_names)}")

    new_names_bios = []
    for name in sorted(new_names):
        try:
            bio = generate_bio(client, name)
        except Exception as exc:
            bio = f"Bio unavailable ({exc})."
        new_names_bios.append((name, bio))
        print(f"  {name} — {bio}")

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
