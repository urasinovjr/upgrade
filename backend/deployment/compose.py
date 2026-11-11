import hashlib
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PRODUCTION = Path(os.environ.get("UPGRADE_COMPOSE_FILE", ROOT / "compose.production.yaml"))
DATABASE_DUMP = "database.dump"
FILES_ARCHIVE = "files.tar"
MANIFEST = "manifest.json"


def compose(project: str) -> list[str]:
    command = ["docker", "compose", "-p", project]
    if environment := os.environ.get("UPGRADE_RELEASE_ENV"):
        command += ["--env-file", environment]
    return [*command, "-f", str(PRODUCTION)]


def digest(path: Path) -> str:
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def run_to_file(run, command: list[str], path: Path) -> None:
    with path.open("wb") as target:
        run(command, stdout=target, check=True, cwd=ROOT)


def run_from_file(run, command: list[str], path: Path) -> None:
    with path.open("rb") as source:
        run(command, stdin=source, check=True, cwd=ROOT)
