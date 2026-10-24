import json
import subprocess

import pytest

from deployment.backup import backup
from deployment.restore import RestoreRefused, restore


class FakeRun:
    def __init__(self, volumes: str = ""):
        self.commands: list[list[str]] = []
        self.volumes = volumes

    def __call__(self, command, **options):
        self.commands.append(command)
        if options.get("stdout") is not None:
            options["stdout"].write(b"data for " + command[-1].encode())
        stdout = self.volumes if command[:3] == ["docker", "volume", "ls"] else "files: 1"
        return subprocess.CompletedProcess(command, 0, stdout=stdout)

    def steps(self) -> list[str]:
        return [" ".join(command[6:8]) for command in self.commands if command[1] == "compose"]


def test_backup_stops_the_worker_dumps_both_stores_and_writes_a_manifest(tmp_path):
    run = FakeRun()
    target = tmp_path / "backup"

    manifest = backup("upgrade-production", target, run)

    assert run.steps() == ["stop worker", "exec -T", "run --rm", "start worker"]
    assert set(manifest["files"]) == {"database.dump", "files.tar"}
    assert json.loads((target / "manifest.json").read_text())["files"] == manifest["files"]
    assert (target / "database.dump").stat().st_mode & 0o077 == 0


def test_restore_checks_files_and_runs_in_a_separate_project(tmp_path):
    target = tmp_path / "backup"
    backup("upgrade-production", target, FakeRun())
    run = FakeRun()

    output = restore(target, "upgrade-restore-check", run=run)

    assert output == "files: 1"
    assert run.steps() == ["up -d", "exec -T", "run --rm", "run --rm", "down -v"]
    assert all("upgrade-restore-check" in command for command in run.commands[1:])


def test_restore_refuses_production_changed_files_and_used_projects(tmp_path):
    target = tmp_path / "backup"
    backup("upgrade-production", target, FakeRun())

    with pytest.raises(RestoreRefused, match="отдельный проект"):
        restore(target, "upgrade-production", run=FakeRun())
    with pytest.raises(RestoreRefused, match="уже есть тома"):
        restore(target, "upgrade-restore-check", run=FakeRun(volumes="old_db_data"))
    (target / "files.tar").write_bytes(b"changed")
    with pytest.raises(RestoreRefused, match="контрольная сумма"):
        restore(target, "upgrade-restore-check", run=FakeRun())
