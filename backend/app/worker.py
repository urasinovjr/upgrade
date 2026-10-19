import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.database import make_engine, make_session_factory
from app.models import Job, Work
from app.provider import Provider, ProviderError
from app.services.jobs import claim_job, extend_lease, fail_stuck_jobs, finish_job, retry_or_fail
from app.services.processing import run_pipeline

logger = logging.getLogger("worker")


async def keep_lease(
    sessions: async_sessionmaker[AsyncSession], job: Job, settings: Settings
) -> None:
    while True:
        await asyncio.sleep(settings.heartbeat_seconds)
        async with sessions() as session:
            await extend_lease(session, job.id, settings.lease_seconds)


async def handle_job(
    sessions: async_sessionmaker[AsyncSession], provider: Provider, settings: Settings, job: Job
) -> None:
    async with sessions() as session:
        work = await session.get(Work, job.work_id)
    assert work is not None
    heartbeat = asyncio.create_task(keep_lease(sessions, job, settings))
    try:
        text, analysis = await run_pipeline(provider, work.upload_id, work.pages)
    except ProviderError as error:
        async with sessions() as session:
            await retry_or_fail(
                session,
                job.id,
                job.attempts,
                error.code,
                settings.job_attempts,
                settings.retry_delay,
            )
        logger.info("job_retry job=%s attempt=%s error=%s", job.id, job.attempts, error.code)
        return
    finally:
        heartbeat.cancel()
    async with sessions() as session:
        await finish_job(session, job.id, work.id, text, analysis)
    logger.info("job_done job=%s attempt=%s", job.id, job.attempts)


async def run_worker(
    sessions: async_sessionmaker[AsyncSession], provider: Provider, settings: Settings
) -> None:
    slots = asyncio.Semaphore(settings.worker_concurrency)
    running: set[asyncio.Task] = set()

    def on_done(task: asyncio.Task) -> None:
        running.discard(task)
        slots.release()
        if not task.cancelled() and task.exception():
            logger.error("job_crashed error=%r", task.exception())

    while True:
        await slots.acquire()
        async with sessions() as session:
            job = await claim_job(session, settings.lease_seconds, settings.job_attempts)
        if job is None:
            slots.release()
            async with sessions() as session:
                await fail_stuck_jobs(session, settings.job_attempts)
            await asyncio.sleep(settings.poll_seconds)
            continue
        task = asyncio.create_task(handle_job(sessions, provider, settings, job))
        running.add(task)
        task.add_done_callback(on_done)


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    settings = Settings()
    engine = make_engine(settings.database_url, settings.db_pool_size)
    provider = Provider(settings.provider_url, settings.provider_timeout)
    logger.info("worker_started concurrency=%s", settings.worker_concurrency)
    try:
        await run_worker(make_session_factory(engine), provider, settings)
    finally:
        await provider.close()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
