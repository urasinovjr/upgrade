import json
import subprocess

import pytest

from deployment import release, retention
from deployment.protocol import PREFIX, ReleaseRefused, validate

PAYLOAD = {
    "sha": "a" * 40,
    "images": {name: f"{PREFIX}-{name}@sha256:" + "b" * 64 for name in ("backend", "frontend")},
    "token": "temporary-test-token",
}


@pytest.mark.parametrize(
    "change",
    [
        {"sha": "main"},
        {"sha": "../escape"},
        {"images": {"backend": "attacker/image@sha256:" + "b" * 64}},
        {"images": {name: f"{PREFIX}-{name}:latest" for name in ("backend", "frontend")}},
        {"token": "token\ncommand"},
        {"command": "shell"},
    ],
)
def test_deployer_rejects_mutable_images_and_commands(change):
    with pytest.raises(ReleaseRefused):
        validate({**PAYLOAD, **change})


def test_release_identity_is_immutable_and_contains_no_token(tmp_path, monkeypatch):
    (tmp_path / "releases").mkdir()
    monkeypatch.setattr(release, "ROOT", tmp_path)
    target = release.create_release(PAYLOAD)
    assert release.create_release(PAYLOAD) == target
    assert PAYLOAD["token"] not in "".join(path.read_text() for path in target.iterdir())
    changed = {**PAYLOAD, "images": {**PAYLOAD["images"], "backend": "another-image"}}
    with pytest.raises(ReleaseRefused):
        release.create_release(changed)


@pytest.fixture
def deployment(tmp_path, monkeypatch):
    old = tmp_path / "old"
    new = tmp_path / "new"
    old.mkdir()
    new.mkdir()
    events = []
    monkeypatch.setattr(release, "create_release", lambda _: new)
    monkeypatch.setattr(release, "active", lambda: old)
    monkeypatch.setattr(release, "pull", lambda *_: events.append("pull"))
    monkeypatch.setattr(release, "revision", lambda _: "0020")
    monkeypatch.setattr(release, "image_head", lambda _: "0020")
    monkeypatch.setattr(release, "backup", lambda *_: events.append("backup"))
    monkeypatch.setattr(release, "activate", lambda path: events.append(("activate", path)))
    monkeypatch.setattr(retention, "cleanup", lambda *_: events.append("cleanup"))
    return old, new, events


def test_failed_new_image_restores_previous_images_with_same_schema(deployment, monkeypatch):
    old, new, events = deployment
    monkeypatch.setattr(release, "compose", lambda _, *args: events.append(args))

    def healthy(path):
        events.append(("health", path))
        if path == new:
            raise subprocess.CalledProcessError(1, "new image")

    monkeypatch.setattr(release, "healthy", healthy)
    with pytest.raises(subprocess.CalledProcessError):
        release.deploy(PAYLOAD)
    assert events.index("backup") < next(i for i, event in enumerate(events) if "migrate" in event)
    assert events[-1] == ("health", old)
    assert not any(isinstance(event, tuple) and event[0] == "activate" for event in events)


def test_failed_migration_preserves_database_for_manual_recovery(deployment, monkeypatch):
    _, _, events = deployment
    monkeypatch.setattr(release, "image_head", lambda _: "0021")
    monkeypatch.setattr(
        release, "healthy", lambda _: pytest.fail("Must not start an unsafe release")
    )

    def compose(_, *arguments):
        events.append(arguments)
        if "migrate" in arguments:
            raise subprocess.CalledProcessError(1, "migration")

    monkeypatch.setattr(release, "compose", compose)
    with pytest.raises(subprocess.CalledProcessError):
        release.deploy(PAYLOAD)
    assert events[-1] == ("stop", "api", "worker")
    assert not any("downgrade" in event or "restore" in event for event in events)


def test_repeat_deploy_checks_health_without_a_new_backup(deployment, monkeypatch):
    _, new, events = deployment
    monkeypatch.setattr(release, "active", lambda: new)
    monkeypatch.setattr(release, "healthy", lambda _: events.append("healthy"))
    release.deploy(PAYLOAD)
    assert events == ["healthy", "cleanup"]


@pytest.mark.parametrize("revision", ["0020", "0021"])
def test_boot_checks_the_schema_before_resuming_writes(deployment, monkeypatch, revision):
    _, current, events = deployment
    monkeypatch.setattr(release, "active", lambda: current)
    monkeypatch.setattr(release, "revision", lambda _: revision)
    monkeypatch.setattr(release, "compose", lambda _, *args: events.append(args))
    monkeypatch.setattr(release, "healthy", lambda _: events.append("healthy"))
    if revision == "0020":
        release.start()
        assert events[-2:] == ["healthy", "cleanup"]
    else:
        with pytest.raises(ReleaseRefused, match="schema differs"):
            release.start()
        assert "healthy" not in events


@pytest.mark.parametrize("error", [OSError("disk full"), subprocess.CalledProcessError(1, "dump")])
def test_failed_backup_resumes_previous_release(deployment, monkeypatch, error):
    old, _, events = deployment
    monkeypatch.setattr(release, "compose", lambda _, *args: events.append(args))
    monkeypatch.setattr(release, "healthy", lambda path: events.append(("health", path)))

    def fail_backup(*_):
        raise error

    monkeypatch.setattr(release, "backup", fail_backup)
    with pytest.raises(type(error)):
        release.deploy(PAYLOAD)
    assert events[-1] == ("health", old)
    assert not any("migrate" in event for event in events)


def test_retention_keeps_two_releases_and_only_removes_project_containers(tmp_path, monkeypatch):
    monkeypatch.setattr(retention, "ROOT", tmp_path)
    commands = []

    def run(command, **_):
        commands.append(command)
        return subprocess.CompletedProcess(command, 0, stdout="stopped-upgrade\n")

    monkeypatch.setattr(retention, "run", run)
    monkeypatch.setattr(retention.subprocess, "run", run)
    releases = [tmp_path / "releases" / str(index) for index in range(3)]
    for index, path in enumerate(releases):
        path.mkdir(parents=True)
        (path / "release.json").write_text(json.dumps({"images": {"backend": f"upgrade:{index}"}}))
    for kind, count in (("daily", 9), ("prerelease", 4)):
        for index in range(count):
            path = tmp_path / "backups" / f"{kind}-{index}"
            path.mkdir(parents=True)
            (path / "manifest.json").write_text("{}")
    retention.cleanup(releases[2], releases[1])
    assert sorted(path.name for path in (tmp_path / "releases").iterdir()) == ["1", "2"]
    assert len(list((tmp_path / "backups").glob("daily-*"))) == 7
    assert len(list((tmp_path / "backups").glob("prerelease-*"))) == 2
    assert "label=com.docker.compose.project=upgrade-production" in commands[0]
    assert ["docker", "rm", "stopped-upgrade"] in commands
    assert not any("prune" in command or "volume" in command for command in commands)
