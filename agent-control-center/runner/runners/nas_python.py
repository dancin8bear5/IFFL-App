"""nas-python runner: call the Anthropic Messages API directly (light monitors).

Stdlib only (urllib) so it runs on a bare Synology Python with no pip installs.
No Cowork connectors here by design — connector-free agents only. Agents that
need Gmail/Calendar/etc. belong on the `cloud` runner (or a later connector
integration).
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List

import config

OUTPUT_CAP = 100_000


def _dry_run_result(task: Dict[str, Any], started: float) -> Dict[str, Any]:
    prompt = (task.get("prompt") or "").strip()
    text = ("[DRY RUN] nas-python would call Anthropic model "
            "%s.\nPrompt: %s" % (task.get("model") or config.DEFAULT_MODEL, prompt[:400]))
    return {"status": "success", "output": text,
            "durationMs": int((time.time() - started) * 1000),
            "tokens": None, "costUsd": None, "error": None}


def run(task: Dict[str, Any], secrets: List[str], dry_run: bool) -> Dict[str, Any]:
    started = time.time()

    if task.get("type", "prompt") != "prompt":
        return {"status": "error", "output": "", "durationMs": 0,
                "error": "nas-python supports task.type='prompt' only (got %r)"
                         % task.get("type")}

    prompt = (task.get("prompt") or "").strip()
    if not prompt:
        return {"status": "error", "output": "", "durationMs": 0,
                "error": "task.prompt is empty"}

    # Dry-run explicitly, or whenever no API key is configured.
    if dry_run or config.DRY_RUN or not config.ANTHROPIC_API_KEY:
        return _dry_run_result(task, started)

    model = task.get("model") or config.DEFAULT_MODEL
    max_tokens = int(task.get("maxTokens") or config.DEFAULT_MAX_TOKENS)
    timeout = int(task.get("timeoutSec") or 300)

    body = json.dumps({
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }).encode("utf-8")

    req = urllib.request.Request(
        config.ANTHROPIC_BASE + "/v1/messages",
        data=body,
        headers={
            "x-api-key": config.ANTHROPIC_API_KEY,
            "anthropic-version": config.ANTHROPIC_VERSION,
            "content-type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:2000]
        return {"status": "error", "output": "", "durationMs": int((time.time() - started) * 1000),
                "error": "Anthropic API %s: %s" % (exc.code, detail)}
    except urllib.error.URLError as exc:
        return {"status": "error", "output": "", "durationMs": int((time.time() - started) * 1000),
                "error": "network error: %s" % exc.reason}

    # Extract text from content blocks.
    parts = []
    for block in data.get("content", []):
        if isinstance(block, dict) and block.get("type") == "text":
            parts.append(block.get("text", ""))
    output = ("\n".join(parts) or json.dumps(data))[:OUTPUT_CAP]

    usage = data.get("usage") or {}
    tokens = None
    if isinstance(usage, dict):
        tokens = (usage.get("input_tokens") or 0) + (usage.get("output_tokens") or 0) or None

    is_error = data.get("type") == "error" or data.get("stop_reason") == "error"
    return {"status": "error" if is_error else "success",
            "output": output,
            "durationMs": int((time.time() - started) * 1000),
            "tokens": tokens,
            "costUsd": None,
            "error": None if not is_error else output}
