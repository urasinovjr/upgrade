import asyncio

import pytest
from sqlalchemy import func, select

from app.errors import DomainError
from app.provider import ProviderError
from app.stand import StandResult
from app.stand.intake import process_idempotent
from tests.conftest import FakeProvider, make_client, work_data
from tests.fakes import MemoryStorage


class GatedProvider(FakeProvider):
    def __init__(self):
        super().__init__()
        self.gate = asyncio.Event()

    async def recognize(self, upload_id: str, pages: int) -> str:
        self.calls += 1
        await self.gate.wait()
        return f"text of {upload_id}"


async def results(sessions) -> int:
    async with sessions() as session:
        return await session.scalar(select(func.count()).select_from(StandResult))


async def call(sessions, provider, settings, key: str = "key-1") -> StandResult:
    async with sessions() as session:
        return await process_idempotent(session, provider, settings, work_data(), key)


async def test_repeat_after_success_returns_the_stored_result(sessions, test_settings):
    provider = FakeProvider()

    first = await call(sessions, provider, test_settings)
    second = await call(sessions, provider, test_settings)

    assert first.id == second.id
    assert provider.calls == 1


async def test_parallel_requests_make_one_provider_call(sessions, test_settings):
    provider = GatedProvider()
    first = asyncio.create_task(call(sessions, provider, test_settings))
    await asyncio.sleep(0.05)

    outcomes = await asyncio.gather(
        *(call(sessions, provider, test_settings) for _ in range(5)), return_exceptions=True
    )
    provider.gate.set()
    await first

    assert all(isinstance(item, DomainError) for item in outcomes)
    assert {item.code for item in outcomes} == {"work_in_progress"}
    assert provider.calls == 1
    assert await results(sessions) == 1


async def test_abandoned_claim_is_taken_over(sessions, test_settings):
    stale = test_settings.model_copy(update={"sync_claim_seconds": 0.0})
    abandoned = GatedProvider()
    first = asyncio.create_task(call(sessions, abandoned, stale))
    await asyncio.sleep(0.05)

    taken = await call(sessions, FakeProvider(), stale)
    abandoned.gate.set()
    late = await first

    assert taken.id == late.id
    assert await results(sessions) == 1


async def test_failure_releases_the_claim(sessions, test_settings):
    with pytest.raises(ProviderError):
        await call(sessions, FakeProvider(failures=10), test_settings)

    result = await call(sessions, FakeProvider(), test_settings)

    assert result.text == "text of key-1"


async def test_sync_route_accepts_an_idempotency_key(client):
    headers = {"X-Upload-Id": "upload-9", "Idempotency-Key": "upload-9"}

    first = await client.post("/sync/works", json=work_data().model_dump(), headers=headers)
    second = await client.post("/sync/works", json=work_data().model_dump(), headers=headers)

    assert first.status_code == second.status_code == 200
    assert first.json()["work_id"] == second.json()["work_id"]


async def test_upload_routes_store_pages_before_processing(sessions, test_settings):
    storage = MemoryStorage()
    meta = work_data().model_dump_json()
    files = [("pages", ("1.bin", b"page-1")), ("pages", ("2.bin", b"page-2"))]
    async for http in make_client(test_settings, FakeProvider(), storage=storage):
        queued = await http.post(
            "/works/upload", data={"meta": meta}, files=files, headers={"Idempotency-Key": "up-1"}
        )
        done = await http.post(
            "/sync/works/upload", data={"meta": meta}, files=files, headers={"X-Upload-Id": "up-2"}
        )

    assert (queued.status_code, done.status_code) == (202, 200)
    assert sorted(storage.objects) == [
        "stand/teacher-1/up-1/1",
        "stand/teacher-1/up-1/2",
        "stand/teacher-1/up-2/1",
        "stand/teacher-1/up-2/2",
    ]
