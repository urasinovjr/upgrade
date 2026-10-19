import asyncio
from datetime import timedelta

from sqlalchemy import func, select, update

from app.models import Job, Result
from app.services.intake import accept_work
from app.services.jobs import claim_job, fail_stuck_jobs, finish_job, retry_or_fail
from tests.conftest import work_data


async def add_job(sessions, upload_id: str) -> Job:
    async with sessions() as session:
        return await accept_work(session, work_data(), upload_id)


async def claim(sessions, max_attempts: int = 5) -> Job | None:
    async with sessions() as session:
        return await claim_job(session, lease_seconds=5, max_attempts=max_attempts)


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
    job = await add_job(sessions, "upload-1")
    await claim(sessions, max_attempts=1)
    await expire_lease(sessions, job.id)

    assert await claim(sessions, max_attempts=1) is None
    async with sessions() as session:
        await fail_stuck_jobs(session, max_attempts=1)
    stored = await load(sessions, job.id)
    assert stored.status == "failed"
    assert stored.last_error == "lease_expired"


async def test_failed_attempt_is_retried_until_limit(sessions):
    job = await add_job(sessions, "upload-1")
    claimed = await claim(sessions)

    async with sessions() as session:
        await retry_or_fail(session, job.id, claimed.attempts, "provider_timeout", 2, 0.01)
    assert (await load(sessions, job.id)).status == "retrying"

    await asyncio.sleep(0.05)
    claimed = await claim(sessions)
    async with sessions() as session:
        await retry_or_fail(session, job.id, claimed.attempts, "provider_timeout", 2, 0.01)
    stored = await load(sessions, job.id)
    assert stored.status == "failed"
    assert stored.attempts == 2


async def test_result_is_published_once(sessions):
    job = await add_job(sessions, "upload-1")

    for _ in range(2):
        async with sessions() as session:
            await finish_job(session, job.id, job.work_id, "text", {"steps": 1})

    async with sessions() as session:
        results = await session.scalar(select(func.count()).select_from(Result))
    assert results == 1
    assert (await load(sessions, job.id)).status == "done"
