# Music City Autograph Show — Attendee Notifier

Runs daily at **3:00 PM CDT** via GitHub Actions. Detects new celebrities/athletes added to the
[Music City Autograph Show price list](https://musiccityautographshow.com/pages/price-list),
generates a one-sentence bio for each new name using Claude, saves a text file, and sends a push
notification to your phone via [ntfy.sh](https://ntfy.sh).

---

## How It Works

1. Fetches the show's price-list page (with Playwright fallback if the site blocks plain requests)
2. Extracts candidate person names from the page HTML
3. Compares against `data/known_attendees.json` (the last known state)
4. If new names are found:
   - Calls the Claude API to write a one-sentence bio for each person
   - Writes `output/new_attendees_YYYY-MM-DD.txt`
   - POSTs a push notification to your ntfy.sh topic
5. Commits the updated `known_attendees.json` back to the repo

---

## Setup

### 1. ntfy.sh notification (free, 2 minutes)

1. Install the free **ntfy** app on your iPhone or Android device.
2. Choose a private topic name with some random characters, e.g. `mca-show-k9x2m`.
   Keep this private — anyone who knows the topic name can subscribe.
3. In the ntfy app, tap **+** and subscribe to your topic.
4. Add the topic name as a GitHub Actions secret: `NTFY_TOPIC`.

### 2. Claude API key

1. Get an API key from [console.anthropic.com](https://console.anthropic.com).
2. Add it as a GitHub Actions secret: `ANTHROPIC_API_KEY`.

### 3. GitHub Actions secrets

Go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `NTFY_TOPIC` | Your private ntfy.sh topic name |

---

## Manual / Test Run

Trigger a run at any time from **Actions → Check Autograph Show Attendees → Run workflow**.

To force a notification on first run (useful for testing), delete the contents of
`data/known_attendees.json`, leaving just `{"attendees": [], "last_checked": null}`, then
trigger the workflow.

---

## Output Format

`output/new_attendees_YYYY-MM-DD.txt`:

```
New Attendees Detected — 2026-09-10
=============================================

Jerry Rice — Widely regarded as the greatest wide receiver in NFL history, he won three Super Bowls with the San Francisco 49ers.
Dolly Parton — Country music legend and philanthropist, best known for her songwriting and the hit "I Will Always Love You".
```

---

## Local Development

```bash
cd autograph-notifier
pip install -r scraper/requirements.txt
playwright install chromium

export ANTHROPIC_API_KEY=your_key_here
export NTFY_TOPIC=your_topic_here
python scraper/main.py
```
