#!/usr/bin/env bash
# estate-report.sh — post one deploy event to the estate (Supabase estate_ingest).
# RENDERED by brain/deploy/render.py — edit it there, not in the repo copy.
#
#   .github/estate-report.sh <kind> <status> "<summary>" ['<detail json>']
#     kind   run | probe | action | incident
#     status ok | warn | error | unknown
#
# Same contract as ACC runner/events_sync.py: RPC estate_ingest(p_token, p_rows),
# deduped on src. Never fails the job — a reporting outage must not block a deploy.
set -uo pipefail
kind="${1:?kind}"; status="${2:?status}"; summary="${3:?summary}"; detail="${4:-}"; [ -n "$detail" ] || detail='{}'
if [ -z "${ESTATE_SUPABASE_URL:-}" ] || [ -z "${ESTATE_INGEST_TOKEN:-}" ] || [ -z "${ESTATE_SUPABASE_ANON_KEY:-}" ]; then
  echo "estate-report: secrets not set — skipped ($kind $status: $summary)"; exit 0
fi
repo="${GITHUB_REPOSITORY#*/}"; repo="$(echo "$repo" | tr '[:upper:]' '[:lower:]')"
body="$(KIND="$kind" STATUS="$status" SUMMARY="$summary" DETAIL="$detail" REPO="$repo" python3 - <<'PY'
import json, os, datetime
e = os.environ
try: detail = json.loads(e["DETAIL"])
except ValueError: detail = {"raw": e["DETAIL"]}
detail.update({"sha": e.get("GITHUB_SHA"), "ref": e.get("GITHUB_REF_NAME"),
               "event": e.get("GITHUB_EVENT_NAME"),
               "run_url": "%s/%s/actions/runs/%s" % (e.get("GITHUB_SERVER_URL"), e.get("GITHUB_REPOSITORY"), e.get("GITHUB_RUN_ID"))})
row = {"src": "gha:%s:%s:%s:%s:%s" % (e["REPO"], e.get("GITHUB_RUN_ID"), e.get("GITHUB_RUN_ATTEMPT", "1"), e.get("GITHUB_JOB"), e["KIND"]),
       "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
       "urn": "est:deploy:" + e["REPO"], "kind": e["KIND"], "actor": "gha:deploy",
       "status": e["STATUS"], "summary": e["SUMMARY"][:400], "detail": detail, "host": "github"}
print(json.dumps({"p_token": e["ESTATE_INGEST_TOKEN"], "p_rows": [row]}))
PY
)"
code="$(curl -sS -o /dev/null -w '%{http_code}' -m 20 -X POST "$ESTATE_SUPABASE_URL/rest/v1/rpc/estate_ingest" \
  -H "apikey: $ESTATE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $ESTATE_SUPABASE_ANON_KEY" \
  -H 'Content-Type: application/json' --data "$body" || echo 000)"
echo "estate-report: $kind $status → HTTP $code — $summary"
exit 0
