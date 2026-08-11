"""Environment configuration. Stdlib only; NAS(Python 3.8)-compatible."""
from __future__ import annotations

import os
from pathlib import Path

# Optional: load runner/.env if python-dotenv is installed. If not (bare NAS
# Python), fall back to real environment variables only. No hard dependency.
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv(Path(__file__).with_name(".env"))
except Exception:  # noqa: BLE001 - dotenv is a convenience, not a requirement
    pass

# Repo root = parent of runner/
ROOT = Path(__file__).resolve().parent.parent

# --- Store ------------------------------------------------------------------
DB_PATH = os.environ.get("ACC_DB_PATH", str(ROOT / "store" / "acc.sqlite"))
SCHEMA_PATH = str(ROOT / "store" / "schema.sql")
JOBS_DIR = os.environ.get("ACC_JOBS_DIR", str(ROOT / "jobs"))

# --- Anthropic API (nas-python runner) --------------------------------------
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_BASE = os.environ.get("ANTHROPIC_BASE", "https://api.anthropic.com").rstrip("/")
ANTHROPIC_VERSION = os.environ.get("ANTHROPIC_VERSION", "2023-06-01")
DEFAULT_MODEL = os.environ.get("ACC_MODEL", "claude-opus-4-8")
DEFAULT_MAX_TOKENS = int(os.environ.get("ACC_MAX_TOKENS", "1024"))

# --- Dashboard --------------------------------------------------------------
SERVER_HOST = os.environ.get("ACC_HOST", "0.0.0.0")
SERVER_PORT = int(os.environ.get("ACC_PORT", "8787"))
WEB_DIR = str(ROOT / "web")

# When true, runners return canned output instead of calling any external API.
# Lets you prove the pipeline (SQLite writes) without a key. Also auto-on if no key.
DRY_RUN = os.environ.get("ACC_DRY_RUN", "").lower() in ("1", "true", "yes")
