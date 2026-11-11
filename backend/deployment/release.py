import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from deployment import retention
from deployment.compose import digest
from deployment.protocol import ReleaseRefused, validate
from deployment.runtime import (
    ROOT,
    activate,
    active,
    compose,
    healthy,
    image_head,
    locked,
    revision,
    run,
)


def create_release(payload: dict) -> Path:
    release = ROOT / "releases" / payload["sha"]
    release.mkdir(exist_ok=True)
    document = {"sha": payload["sha"], "images": payload["images"]}
    metadata = release / "release.json"
    if metadata.exists() and json.loads(metadata.read_text()) != document:
        raise ReleaseRefused("A commit cannot change its images")
    metadata.write_text(json.dumps(document, indent=2))
    environment = {
        "UPGRADE_RELEASE": payload["sha"],
        "UPGRADE_BACKEND_IMAGE": payload["images"]["backend"],
        "UPGRADE_FRONTEND_IMAGE": payload["images"]["frontend"],
        "UPGRADE_ENV_FILE": str(ROOT / "config/production.env"),
        "UPGRADE_S3_CONFIG": str(ROOT / "config/s3.json"),
        "UPGRADE_TLS_DIR": str(ROOT / "tls"),
        "UPGRADE_ACME_DIR": str(ROOT / "acme"),
    }
    (release / "release.env").write_text("".join(f"{k}={v}\n" for k, v in environment.items()))
    return release


def pull(release: Path, token: str) -> None:
    with tempfile.TemporaryDirectory() as directory:
        environment = {**os.environ, "DOCKER_CONFIG": directory}
        run(
            ["docker", "login", "ghcr.io", "-u", "urasinovjr", "--password-stdin"],
            input=token,
            text=True,
            env=environment,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        compose(release, "pull", env=environment)


def backup(release: Path, kind: str) -> Path:
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
    destination = ROOT / "backups" / f"{kind}-{stamp}"
    destination.mkdir(mode=0o700)
    try:
        compose(release, "stop", "api", "worker")
        for filename, arguments in (
            (
                "database.dump",
                [
                    "exec",
                    "-T",
                    "db",
                    "sh",
                    "-c",
                    'pg_dump --format=custom -U "$POSTGRES_USER" "$POSTGRES_DB"',
                ],
            ),
            (
                "files.tar",
                [
                    "run",
                    "--rm",
                    "--no-deps",
                    "-T",
                    "api",
                    "python",
                    "-m",
                    "app.cli",
                    "storage-export",
                    "--out",
                    "-",
                ],
            ),
        ):
            with (destination / filename).open("wb") as output:
                compose(release, *arguments, stdout=output)
        retention.manifest(
            destination,
            release.name,
            {name: digest(destination / name) for name in ("database.dump", "files.tar")},
        )
    except (subprocess.CalledProcessError, OSError):
        shutil.rmtree(destination)
        raise
    return destination


def deploy(payload: dict) -> None:
    release = create_release(payload)
    previous = active()
    if previous == release:
        healthy(release)
        retention.cleanup(release, previous_release(release))
        return
    pull(release, payload["token"])
    compose(release, "up", "-d", "--wait", "db", "s3")
    before = revision(previous) if previous else None
    target = image_head(release)
    if previous:
        try:
            backup(previous, "prerelease")
        except (subprocess.CalledProcessError, OSError):
            healthy(previous)
            raise
    try:
        compose(release, "run", "--rm", "--no-deps", "-T", "migrate")
        if previous is None:
            subprocess.run(
                ["docker", "rm", "-f", "upgrade-acme"],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        healthy(release)
        compose(
            release, "run", "--rm", "--no-deps", "-T", "api", "python", "-m", "app.cli", "preflight"
        )
    except subprocess.CalledProcessError:
        compose(release, "stop", "api", "worker")
        if previous and revision(previous) == before == target:
            healthy(previous)
            print("Previous release restored; database unchanged", file=sys.stderr)
        else:
            print("Release stopped; database preserved; manual recovery required", file=sys.stderr)
        raise
    if previous:
        (release / "previous").write_text(previous.name)
    else:
        backup(release, "daily")
        healthy(release)
    activate(release)
    run(["systemctl", "start", "upgrade-backup.timer"])
    retention.cleanup(release, previous)
    print(json.dumps({"sha": release.name, "images": payload["images"], "migration": target}))


def previous_release(release: Path) -> Path | None:
    marker = release / "previous"
    if not marker.exists():
        return None
    previous = ROOT / "releases" / marker.read_text().strip()
    return previous if previous.is_dir() else None


def start() -> None:
    current = active()
    if current is None:
        raise ReleaseRefused("No active release")
    compose(current, "up", "-d", "--wait", "db", "s3")
    if revision(current) != image_head(current):
        raise ReleaseRefused("Database schema differs from the active release; recovery required")
    healthy(current)
    retention.cleanup(current, previous_release(current))


def main() -> None:
    os.umask(0o077)
    operation = (
        sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SSH_ORIGINAL_COMMAND", "deploy")
    )
    with locked():
        if operation == "monitor":
            from deployment.monitor import monitor

            monitor()
        elif operation == "start":
            start()
        elif operation == "backup":
            current = active()
            if current is None:
                raise ReleaseRefused("No active release")
            try:
                backup(current, "daily")
            finally:
                healthy(current)
            retention.backups()
        elif operation == "deploy":
            request = sys.stdin.read(16385)
            if len(request) > 16384:
                raise ReleaseRefused("Release request is too large")
            deploy(validate(json.loads(request)))
        else:
            raise ReleaseRefused("Unsupported operation")


if __name__ == "__main__":
    main()
