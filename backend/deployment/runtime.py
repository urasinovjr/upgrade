import fcntl
import json
import os
import subprocess
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(os.environ.get("UPGRADE_ROOT", "/opt/upgrade"))
PROJECT = "upgrade-production"


@contextmanager
def locked():
    with (ROOT / "operation.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def run(command: list[str], **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(command, check=True, **kwargs)


def compose(release: Path, *arguments: str, **kwargs) -> subprocess.CompletedProcess:
    return run(
        [
            "docker",
            "compose",
            "-p",
            PROJECT,
            "--env-file",
            str(release / "release.env"),
            "-f",
            str(ROOT / "runtime/compose.production.yaml"),
            *arguments,
        ],
        **kwargs,
    )


def active() -> Path | None:
    current = ROOT / "current"
    return current.resolve() if current.is_symlink() else None


def activate(release: Path) -> None:
    temporary = ROOT / "current.next"
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(release)
    temporary.replace(ROOT / "current")


def metadata(release: Path) -> dict:
    return json.loads((release / "release.json").read_text())


def revision(release: Path) -> str:
    result = compose(
        release,
        "exec",
        "-T",
        "db",
        "sh",
        "-c",
        'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT version_num FROM alembic_version"',
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def image_head(release: Path) -> str:
    result = compose(
        release,
        "run",
        "--rm",
        "--no-deps",
        "-T",
        "api",
        "python",
        "-c",
        "from app.operations import migration_head; print(migration_head())",
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def healthy(release: Path) -> None:
    compose(release, "up", "-d", "--no-build", "--wait", "--wait-timeout", "180")
    compose(release, "exec", "-T", "frontend", "nginx", "-t")
    run(
        [
            "curl",
            "--fail",
            "--silent",
            "--show-error",
            "--max-time",
            "15",
            "https://193.233.218.52/",
        ],
        stdout=subprocess.DEVNULL,
    )
