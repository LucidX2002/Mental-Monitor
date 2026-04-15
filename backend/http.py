from __future__ import annotations

import argparse
import json
import re
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

from backend.service import (
    DEFAULT_EXTRAVERSION_THRESHOLD,
    DEFAULT_NEUROTICISM_THRESHOLD,
    MentalHealthService,
)


def _as_bool(raw: str | None, default: bool = False) -> bool:
    if raw is None:
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


def _as_int(raw: str | None, default: int) -> int:
    try:
        return int(raw) if raw is not None else default
    except ValueError:
        return default


def _as_float(raw: str | None, default: float) -> float:
    try:
        return float(raw) if raw is not None else default
    except ValueError:
        return default


class ApiHandler(BaseHTTPRequestHandler):
    service = MentalHealthService()

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT)
        self._write_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)

        try:
            if parsed.path == "/api/health":
                self._send_json({"status": "ok"})
                return

            if parsed.path == "/api/summary":
                self._send_json(
                    self.service.get_summary(
                        neuro_threshold=_as_float(
                            query.get("neuroticism_min", [None])[0],
                            DEFAULT_NEUROTICISM_THRESHOLD,
                        ),
                        extra_threshold=_as_float(
                            query.get("extraversion_max", [None])[0],
                            DEFAULT_EXTRAVERSION_THRESHOLD,
                        ),
                    )
                )
                return

            if parsed.path == "/api/scatter":
                self._send_json(
                    self.service.get_scatter(
                        limit=_as_int(query.get("limit", [None])[0], 800),
                        neuro_threshold=_as_float(
                            query.get("neuroticism_min", [None])[0],
                            DEFAULT_NEUROTICISM_THRESHOLD,
                        ),
                        extra_threshold=_as_float(
                            query.get("extraversion_max", [None])[0],
                            DEFAULT_EXTRAVERSION_THRESHOLD,
                        ),
                    )
                )
                return

            if parsed.path == "/api/users":
                self._send_json(
                    self.service.list_users(
                        limit=_as_int(query.get("limit", [None])[0], 100),
                        offset=_as_int(query.get("offset", [None])[0], 0),
                        query=query.get("q", [""])[0],
                        risk_only=_as_bool(query.get("risk_only", [None])[0]),
                        neuro_threshold=_as_float(
                            query.get("neuroticism_min", [None])[0],
                            DEFAULT_NEUROTICISM_THRESHOLD,
                        ),
                        extra_threshold=_as_float(
                            query.get("extraversion_max", [None])[0],
                            DEFAULT_EXTRAVERSION_THRESHOLD,
                        ),
                    )
                )
                return

            if match := re.fullmatch(r"/api/users/(\d+)", parsed.path):
                user_id = int(match.group(1))
                self._send_json(
                    self.service.get_user(
                        user_id=user_id,
                        neuro_threshold=_as_float(
                            query.get("neuroticism_min", [None])[0],
                            DEFAULT_NEUROTICISM_THRESHOLD,
                        ),
                        extra_threshold=_as_float(
                            query.get("extraversion_max", [None])[0],
                            DEFAULT_EXTRAVERSION_THRESHOLD,
                        ),
                    )
                )
                return

            if match := re.fullmatch(r"/api/users/(\d+)/recommendations", parsed.path):
                user_id = int(match.group(1))
                self._send_json(
                    self.service.get_recommendations(
                        user_id=user_id,
                        k=_as_int(query.get("k", [None])[0], 5),
                    )
                )
                return

            self._send_json({"error": "Not found"}, status=HTTPStatus.NOT_FOUND)
        except KeyError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.NOT_FOUND)
        except Exception as exc:  # pragma: no cover - integration safeguard
            self._send_json({"error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        try:
            if match := re.fullmatch(r"/api/users/(\d+)/case-state", parsed.path):
                user_id = int(match.group(1))
                payload = self._read_json_body()
                status = str(payload.get("status", "pending"))
                note = str(payload.get("note", ""))
                self._send_json(self.service.update_case_state(user_id, status=status, note=note))
                return

            self._send_json({"error": "Not found"}, status=HTTPStatus.NOT_FOUND)
        except KeyError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.NOT_FOUND)
        except Exception as exc:  # pragma: no cover - integration safeguard
            self._send_json({"error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        return

    def _read_json_body(self) -> dict[str, Any]:
        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length) if content_length else b"{}"
        return json.loads(body.decode("utf-8"))

    def _send_json(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._write_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _write_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")


def run_server(host: str = "127.0.0.1", port: int = 8000) -> None:
    server = ThreadingHTTPServer((host, port), ApiHandler)
    print(f"Backend API listening on http://{host}:{port}")
    server.serve_forever()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the mental health backend API.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    run_server(host=args.host, port=args.port)


if __name__ == "__main__":
    main()
