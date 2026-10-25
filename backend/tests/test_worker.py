import asyncio

from sqlalchemy import select

from app.queue import Job, claim_job
from app.stand import StandResult, accept_work
from app.worker import full_kinds, handle_job
from tests.conftest import FakeProvider, work_data, worker_context


class SlowProvider(FakeProvider):
    def __init__(self, seconds: float):
        super().__init__()
        self.seconds = seconds

    async def recognize(self, upload_id: str, pages: int) -> str:
        await asyncio.sleep(self.seconds)
        return await super().recognize(upload_id, pages)


async def claimed_job(sessions, max_attempts: int = 5) -> Job:
    async with sessions() as session:
        await accept_work(session, work_data(), "upload-1", max_attempts)
    async with sessions() as session:
        return await claim_job(session, lease_seconds=5)


async def test_worker_saves_result(sessions, test_settings):
    job = await claimed_job(sessions)

    await handle_job(worker_context(sessions, test_settings, FakeProvider()), job)

    async with sessions() as session:
        stored = await session.get(Job, job.id)
        result = await session.scalar(
            select(StandResult).where(StandResult.work_id == job.subject_id)
        )
    assert stored.status == "done"
    assert result.text == "text of upload-1"


async def test_worker_schedules_retry_on_provider_error(sessions, test_settings):
    job = await claimed_job(sessions)

    await handle_job(worker_context(sessions, test_settings, FakeProvider(failures=1)), job)

    async with sessions() as session:
        stored = await session.get(Job, job.id)
    assert stored.status == "retrying"
    assert stored.last_error == "provider_unavailable"


async def test_worker_fails_job_on_last_attempt(sessions, test_settings):
    job = await claimed_job(sessions, max_attempts=1)

    await handle_job(worker_context(sessions, test_settings, FakeProvider(failures=1)), job)

    async with sessions() as session:
        stored = await session.get(Job, job.id)
    assert stored.status == "failed"


async def test_long_job_keeps_its_lease(sessions, test_settings):
    settings = test_settings.model_copy(update={"lease_seconds": 0.3, "heartbeat_seconds": 0.1})
    async with sessions() as session:
        await accept_work(session, work_data(), "upload-1", 5)
    async with sessions() as session:
        job = await claim_job(session, lease_seconds=settings.lease_seconds)
    context = worker_context(sessions, settings, SlowProvider(1.0))

    task = asyncio.create_task(handle_job(context, job))
    await asyncio.sleep(0.7)
    async with sessions() as session:
        second = await claim_job(session, lease_seconds=settings.lease_seconds)
    await task

    async with sessions() as session:
        stored = await session.get(Job, job.id)
    assert second is None
    assert stored.status == "done"
    assert stored.attempts == 1


def test_full_kinds_are_skipped_until_a_slot_frees():
    limits = {"work_analysis": 1}

    assert full_kinds(["send_email"], limits) == ()
    assert full_kinds(["work_analysis", "send_email"], limits) == ("work_analysis",)
