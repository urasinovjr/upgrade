import asyncio
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import func, select, update

from app.queue import Job, claim_job, complete_job, enqueue, fail_stuck_jobs, retry_or_fail
from app.stand import StandResult, accept_work
from tests.conftest import work_data


async def add_job(sessions, upload_id: str, max_attempts: int = 5) -> Job:
    async with sessions() as session:
        return await accept_work(session, work_data(), upload_id, max_attempts)


async def claim(sessions) -> Job | None:
    async with sessions() as session:
        return await claim_job(session, lease_seconds=5)


async def load(sessions, job_id) -> Job:
    async with sessions() as session:
        return await session.get(Job, job_id)


async def expire_lease(sessions, job_id) -> None:
    async with sessions() as session:
        past = func.clock_timestamp() - timedelta(seconds=1)
        await session.execute(update(Job).where(Job.id == job_id).values(lease_until=past))
        await session.commit()


async def test_parallel_claims_take_different_jobs(sessions):
    await add_job(sessions, "upload-1")
    await add_job(sessions, "upload-2")

    first, second = await asyncio.gather(claim(sessions), claim(sessions))

    assert first.id != second.id
    assert await claim(sessions) is None


async def test_abandoned_job_is_claimed_again(sessions):
    job = await add_job(sessions, "upload-1")
    await claim(sessions)
    await expire_lease(sessions, job.id)

    again = await claim(sessions)

    assert again.id == job.id
    assert again.attempts == 2


async def test_abandoned_job_on_last_attempt_fails(sessions):
    job = await add_job(sessions, "upload-1", max_attempts=1)
    await claim(sessions)
    await expire_lease(sessions, job.id)

    assert await claim(sessions) is None
    async with sessions() as session:
        failed = await fail_stuck_jobs(session)
    assert [item.id for item in failed] == [job.id]
    stored = await load(sessions, job.id)
    assert stored.status == "failed"
    assert stored.last_error == "lease_expired"


async def test_failed_attempt_is_retried_until_limit(sessions):
    job = await add_job(sessions, "upload-1", max_attempts=2)
    claimed = await claim(sessions)

    async with sessions() as session:
        assert not await retry_or_fail(session, claimed, "provider_timeout", 0.01)
    assert (await load(sessions, job.id)).status == "retrying"

    await asyncio.sleep(0.05)
    claimed = await claim(sessions)
    async with sessions() as session:
        assert await retry_or_fail(session, claimed, "provider_timeout", 0.01)
    stored = await load(sessions, job.id)
    assert stored.status == "failed"
    assert stored.attempts == 2


async def test_repeated_upload_reuses_stand_job(sessions):
    first = await add_job(sessions, "upload-1")
    second = await add_job(sessions, "upload-1")

    async with sessions() as session:
        jobs = await session.scalar(select(func.count()).select_from(Job))
        results = await session.scalar(select(func.count()).select_from(StandResult))
    assert second.id == first.id
    assert jobs == 1
    assert results == 0


async def test_dedupe_key_returns_existing_job(sessions):
    subject = uuid4()
    async with sessions() as session:
        first = await enqueue(session, "send_email", subject, 3, {"to": "a"}, dedupe_key="mail:1")
        second = await enqueue(session, "send_email", subject, 3, {"to": "b"}, dedupe_key="mail:1")
        await session.commit()

    assert second.id == first.id
    assert second.payload == {"to": "a"}


async def test_completed_job_keeps_new_payload(sessions):
    async with sessions() as session:
        job = await enqueue(session, "send_email", uuid4(), 3, {"token": "secret"})
        await complete_job(session, job.id, {"template": "confirm"})
        await session.commit()

    stored = await load(sessions, job.id)
    assert stored.status == "done"
    assert stored.payload == {"template": "confirm"}
