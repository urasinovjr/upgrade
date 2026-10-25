import os
import sys
from pathlib import Path
from time import time

DEFAULT_FILE = "/tmp/upgrade-worker-heartbeat"
DEFAULT_SECONDS = 10.0


def write_heartbeat(path: Path) -> None:
    path.write_text(str(time()))


def heartbeat_is_fresh(path: Path, max_age: float) -> bool:
    try:
        return time() - path.stat().st_mtime <= max_age
    except OSError:
        return False


def main() -> None:
    path = Path(os.environ.get("HEARTBEAT_FILE", DEFAULT_FILE))
    seconds = float(os.environ.get("HEARTBEAT_FILE_SECONDS", DEFAULT_SECONDS))
    sys.exit(0 if heartbeat_is_fresh(path, 3 * seconds) else 1)


if __name__ == "__main__":
    main()
