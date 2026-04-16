from __future__ import annotations

import json
import sys
from urllib.error import URLError
from urllib.request import Request, urlopen


PAGES = [
    "index.html",
    "alerts.html",
    "profile.html",
    "trends.html",
    "inference.html",
]

API_PATHS = [
    "/api/health",
    "/api/dashboard?scatter_limit=5",
    "/api/users?limit=2",
    "/api/users/0",
    "/api/users/0/recommendations?k=2",
    "/api/users/0/timeline",
    "/api/trends",
]


def fetch(url: str, method: str = "GET") -> int:
    request = Request(url, method=method)
    with urlopen(request, timeout=30) as response:
        return response.status


def fetch_post_json(url: str, payload: dict) -> int:
    data = json.dumps(payload).encode("utf-8")
    request = Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=60) as response:
        return response.status


def main() -> int:
    ok = True

    for page in PAGES:
        url = f"http://127.0.0.1:4173/{page}"
        try:
            status = fetch(url, "GET")
            print(f"PAGE {page} -> {status}")
            ok &= status == 200
        except URLError as exc:
            ok = False
            print(f"PAGE {page} -> ERR {exc}")

    try:
        status = fetch("http://127.0.0.1:8000/api/health", "HEAD")
        print(f"API HEAD /api/health -> {status}")
        ok &= status == 200
    except URLError as exc:
        ok = False
        print(f"API HEAD /api/health -> ERR {exc}")

    for path in API_PATHS:
        url = f"http://127.0.0.1:8000{path}"
        try:
            status = fetch(url, "GET")
            print(f"API GET {path} -> {status}")
            ok &= status == 200
        except URLError as exc:
            ok = False
            print(f"API GET {path} -> ERR {exc}")

    try:
        status = fetch_post_json(
            "http://127.0.0.1:8000/api/analyze-text",
            {"text": "最近总是很累，不想和别人交流。"},
        )
        print(f"API POST /api/analyze-text -> {status}")
        ok &= status == 200
    except URLError as exc:
        ok = False
        print(f"API POST /api/analyze-text -> ERR {exc}")

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
