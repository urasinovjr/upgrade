import argparse
import json
import os
import subprocess
from datetime import UTC, datetime
from pathlib import Path

from deployment.compose import (
    DATABASE_DUMP,
    FILES_ARCHIVE,
    MANIFEST,
    ROOT,
    compose,
    digest,
    run_to_file,
)

DUMP = 'pg_dump --format=custom -U "$POSTGRES_USER" "$POSTGRES_DB"'
EXPORT = ["python", "-m", "app.cli", "storage-export", "--out", "-"]


def backup(project: str, destination: Path, run=subprocess.run, resume: bool = True) -> dict:
    os.umask(0o077)
    destination.mkdir(mode=0o700, parents=True, exist_ok=False)
    command = compose(project)
    run([*command, "stop", "api", "worker"], check=True, cwd=ROOT)
    database = [*command, "exec", "-T", "db", "sh", "-c", DUMP]
    files = [*command, "run", "--rm", "--no-deps", "-T", "api", *EXPORT]
    try:
        run_to_file(run, database, destination / DATABASE_DUMP)
        run_to_file(run, files, destination / FILES_ARCHIVE)
    finally:
        if resume:
            run([*command, "start", "api", "worker"], check=True, cwd=ROOT)
    manifest = {
        "project": project,
        "release": os.environ.get("UPGRADE_RELEASE", ""),
        "createdAt": datetime.now(UTC).isoformat(),
        "files": {name: digest(destination / name) for name in (DATABASE_DUMP, FILES_ARCHIVE)},
    }
    (destination / MANIFEST).write_text(json.dumps(manifest, indent=2), "utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="back up the database and stored files")
    parser.add_argument("destination", type=Path)
    parser.add_argument("-p", "--project", default="upgrade-production")
    args = parser.parse_args()
    manifest = backup(args.project, args.destination)
    print(f"резервная копия готова: {args.destination} ({manifest['createdAt']})")


if __name__ == "__main__":
    main()
