from __future__ import annotations

import signal
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def spawn(command: list[str]) -> subprocess.Popen[str]:
    return subprocess.Popen(command, cwd=ROOT)


def main() -> None:
    processes = [
        spawn([sys.executable, "-m", "backend", "--host", "127.0.0.1", "--port", "8000"]),
        spawn([sys.executable, "-m", "http.server", "4173", "-d", "frontend"]),
    ]

    print("backend:  http://127.0.0.1:8000")
    print("frontend: http://127.0.0.1:4173")

    def shutdown(*_: object) -> None:
        for process in processes:
            if process.poll() is None:
                process.terminate()
        for process in processes:
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
        raise SystemExit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    try:
        while True:
            for process in processes:
                code = process.poll()
                if code is not None:
                    shutdown()
            time.sleep(0.5)
    except KeyboardInterrupt:
        shutdown()


if __name__ == "__main__":
    main()
