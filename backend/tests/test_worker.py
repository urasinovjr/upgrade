import asyncio

from sqlalchemy import func, select

from app import worker
from app.queue import Job, claim_job
from app.stand import StandResult, accept_work
from app.worker import full_kinds, handle_job
from tests.conftest import FakeProvider, work_data, worker_context


class SlowProvider(FakeProvider):
    def __init__(self):
        super().__init__()
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    async def recognize(self, upload_id: str, pages: int) -> str:
        self.started.set()
        await self.release.wait()
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


async def test_long_job_keeps_its_lease(sessions, test_settings, monkeypatch):
    settings = test_settings
    async with sessions() as session:
        await accept_work(session, work_data(), "upload-1", 5)
    async with sessions() as session:
        job = await claim_job(session, lease_seconds=settings.lease_seconds)
        original_expiry = await session.scalar(select(Job.lease_until).where(Job.id == job.id))
    provider = SlowProvider()
    context = worker_context(sessions, settings, provider)
    renewed_after_expiry = asyncio.Event()
    extend_lease = worker.extend_lease

    async def observe_renewal(session, job_id, lease_seconds):
        await extend_lease(session, job_id, lease_seconds)
        async with sessions() as observation:
            expiry, now = (
                await observation.execute(
                    select(Job.lease_until, func.clock_timestamp()).where(Job.id == job_id)
                )
            ).one()
        if now > original_expiry and expiry > now:
            renewed_after_expiry.set()

    monkeypatch.setattr(worker, "extend_lease", observe_renewal)

    task = asyncio.create_task(handle_job(context, job))
    try:
        await asyncio.wait_for(provider.started.wait(), timeout=10)
        await asyncio.wait_for(renewed_after_expiry.wait(), timeout=30)
        async with sessions() as session:
            second = await claim_job(session, lease_seconds=settings.lease_seconds)
        assert second is None
        assert not task.done()
    finally:
        provider.release.set()
        await asyncio.wait_for(task, timeout=10)

    async with sessions() as session:
        stored = await session.get(Job, job.id)
    assert stored.status == "done"
    assert stored.attempts == 1


def test_full_kinds_are_skipped_until_a_slot_frees():
    limits = {"work_analysis": 1}

    assert full_kinds(["send_email"], limits) == ()
    assert set(full_kinds(["work_analysis", "send_email"], limits)) == set(worker.AI_KINDS)
