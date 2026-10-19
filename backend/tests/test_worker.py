from sqlalchemy import select

from app.models import Job, Result
from app.services.intake import accept_work
from app.services.jobs import claim_job
from app.worker import handle_job
from tests.conftest import FakeProvider, work_data


async def claimed_job(sessions) -> Job:
    async with sessions() as session:
        await accept_work(session, work_data(), "upload-1")
    async with sessions() as session:
        return await claim_job(session, lease_seconds=5, max_attempts=5)


async def test_worker_saves_result(sessions, test_settings):
    job = await claimed_job(sessions)

    await handle_job(sessions, FakeProvider(), test_settings, job)

    async with sessions() as session:
        stored = await session.get(Job, job.id)
        result = await session.scalar(select(Result).where(Result.work_id == job.work_id))
    assert stored.status == "done"
    assert result.text == "text of upload-1"


async def test_worker_schedules_retry_on_provider_error(sessions, test_settings):
    job = await claimed_job(sessions)

    await handle_job(sessions, FakeProvider(failures=1), test_settings, job)

    async with sessions() as session:
        stored = await session.get(Job, job.id)
    assert stored.status == "retrying"
    assert stored.last_error == "provider_unavailable"
