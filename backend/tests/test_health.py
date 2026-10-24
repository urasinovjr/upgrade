import os
import time

from app.heartbeat import heartbeat_is_fresh, write_heartbeat
from tests.conftest import FakeProvider, make_client
from tests.fakes import MemoryStorage


async def test_ready_checks_database_and_storage(sessions, test_settings):
    storage = MemoryStorage()
    async for http in make_client(test_settings, FakeProvider(), storage=storage):
        ready = await http.get("/health/ready")
        storage.failures = 1
        broken = await http.get("/health/ready")
        alive = await http.get("/health")

    assert (ready.status_code, ready.json()) == (200, {"status": "ok"})
    assert (broken.status_code, broken.json()["failed"]) == (503, ["storage"])
    assert alive.status_code == 200


def test_heartbeat_goes_stale(tmp_path):
    path = tmp_path / "heartbeat"
    assert heartbeat_is_fresh(path, 30) is False

    write_heartbeat(path)
    assert heartbeat_is_fresh(path, 30) is True

    old = time.time() - 60
    os.utime(path, (old, old))
    assert heartbeat_is_fresh(path, 30) is False
