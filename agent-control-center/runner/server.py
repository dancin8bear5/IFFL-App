#!/usr/bin/env python3
"""Read-only dashboard server. Stdlib http.server only (NAS-friendly).

    python3 server.py            # serves on ACC_HOST:ACC_PORT (default 0.0.0.0:8787)

Serves the static dashboard at "/" and a small read-only JSON API:
    GET /api/jobs               -> all jobs with state
    GET /api/jobs/<id>          -> one job + recent runs + results
    GET /api/health            -> { ok: true }

MVP is read-only (no Run-now / editing). On the NAS, run this via DSM Task
Scheduler (triggered at boot, KeepAlive-style) or point WebStation at it.
"""
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import config
import store


def _jobs_payload():
    conn = store.connect()
    try:
        return store.all_jobs(conn)
    finally:
        conn.close()


def _job_detail(job_id: str):
    conn = store.connect()
    try:
        job = store.get_job(conn, job_id)
        if job is None:
            return None
        job["runs"] = store.recent_runs(conn, job_id, 20)
        job["results"] = store.recent_results(conn, job_id, 20)
        return job
    finally:
        conn.close()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # quieter logs
        pass

    def _send_json(self, obj, code=200):
        body = json.dumps(obj, default=str).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path, ctype):
        try:
            with open(path, "rb") as fh:
                body = fh.read()
        except OSError:
            self._send_json({"error": "not found"}, 404)
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path

        if path in ("/", "/index.html", "/control-center.html"):
            self._send_file(os.path.join(config.WEB_DIR, "control-center.html"), "text/html")
            return
        if path == "/api/health":
            self._send_json({"ok": True})
            return
        if path == "/api/jobs":
            self._send_json({"jobs": _jobs_payload()})
            return
        if path.startswith("/api/jobs/"):
            job_id = path[len("/api/jobs/"):]
            detail = _job_detail(job_id)
            if detail is None:
                self._send_json({"error": "job not found"}, 404)
            else:
                self._send_json(detail)
            return
        self._send_json({"error": "not found"}, 404)


def main() -> int:
    store.init_db()
    httpd = ThreadingHTTPServer((config.SERVER_HOST, config.SERVER_PORT), Handler)
    print("[server] Agent Control Center dashboard on http://%s:%d"
          % (config.SERVER_HOST, config.SERVER_PORT))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[server] stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
