import argparse
import json
import subprocess
from pathlib import Path

from deployment.compose import (
    DATABASE_DUMP,
    FILES_ARCHIVE,
    MANIFEST,
    ROOT,
    compose,
    digest,
    run_from_file,
)

RESTORE = 'pg_restore --no-owner --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
IMPORT = ["python", "-m", "app.cli", "storage-import", "--file", "-"]
VERIFY = ["python", "-m", "app.cli", "backup-verify"]
PRODUCTION_PROJECT = "upgrade-production"


class RestoreRefused(Exception):
    pass


def checked_manifest(source: Path) -> dict:
    manifest = json.loads((source / MANIFEST).read_text("utf-8"))
    for name, expected in manifest["files"].items():
        if digest(source / name) != expected:
            raise RestoreRefused(f"контрольная сумма не совпадает: {name}")
    return manifest


def used_volumes(project: str, run) -> list[str]:
    found = run(
        ["docker", "volume", "ls", "-q", "--filter", f"label=com.docker.compose.project={project}"],
        capture_output=True,
        text=True,
        check=True,
    )
    return found.stdout.split()


def restore(source: Path, project: str, keep: bool = False, run=subprocess.run) -> str:
    if project == PRODUCTION_PROJECT:
        raise RestoreRefused("восстановление идёт только в отдельный проект")
    checked_manifest(source)
    if used_volumes(project, run):
        raise RestoreRefused(f"у проекта {project} уже есть тома, выберите другое имя")
    command = compose(project)
    run([*command, "up", "-d", "--wait", "db", "s3"], check=True, cwd=ROOT)
    database = [*command, "exec", "-T", "db", "sh", "-c", RESTORE]
    files = [*command, "run", "--rm", "--no-deps", "-T", "api", *IMPORT]
    try:
        run_from_file(run, database, source / DATABASE_DUMP)
        run_from_file(run, files, source / FILES_ARCHIVE)
        checked = run(
            [*command, "run", "--rm", "--no-deps", "-T", "api", *VERIFY],
            capture_output=True,
            text=True,
            check=True,
            cwd=ROOT,
        )
    finally:
        if not keep:
            run([*command, "down", "-v"], check=True, cwd=ROOT)
    return checked.stdout


def main() -> None:
    parser = argparse.ArgumentParser(description="restore a backup into a separate project")
    parser.add_argument("source", type=Path)
    parser.add_argument("-p", "--project", default="upgrade-restore-check")
    parser.add_argument("--keep", action="store_true", help="leave the restored project running")
    args = parser.parse_args()
    try:
        print(restore(args.source, args.project, args.keep))
    except RestoreRefused as error:
        raise SystemExit(str(error)) from error


if __name__ == "__main__":
    main()
