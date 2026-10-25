import asyncio
import logging
from collections import Counter
from collections.abc import Awaitable, Callable, Iterable
from pathlib import Path

from app.analysis import WORK_ANALYSIS_JOB, handle_work_analysis, mark_analysis_failed
from app.analysis.providers import make_provider
from app.analysis.variants import code_commit, get_variant
from app.config import Settings
from app.database import make_engine, make_session_factory
from app.files import DELETE_FILES_JOB, S3Storage, handle_delete_files
from app.heartbeat import write_heartbeat
from app.mail import SEND_EMAIL_JOB, SmtpMailer, forget_email_token, handle_send_email
from app.models import configure_models
from app.observability import configure_logging, request_id_var
from app.provider import Provider
from app.queue import (
    Job,
    JobFailure,
    WorkerContext,
    claim_job,
    defer_job,
    deferral_delay,
    extend_lease,
    fail_stuck_jobs,
    retry_or_fail,
)
from app.stand import STAND_JOB, handle_stand_job

logger = logging.getLogger("worker")

JobHandler = Callable[[WorkerContext, Job], Awaitable[None]]

HANDLERS: dict[str, JobHandler] = {
    STAND_JOB: handle_stand_job,
    SEND_EMAIL_JOB: handle_send_email,
    DELETE_FILES_JOB: handle_delete_files,
    WORK_ANALYSIS_JOB: handle_work_analysis,
}
FAILURE_HOOKS: dict[str, JobHandler] = {
    SEND_EMAIL_JOB: forget_email_token,
    WORK_ANALYSIS_JOB: mark_analysis_failed,
}


async def keep_lease(context: WorkerContext, job: Job) -> None:
    while True:
        await asyncio.sleep(context.settings.heartbeat_seconds)
        async with context.sessions() as session:
            await extend_lease(session, job.id, context.settings.lease_seconds)


async def report_failure(context: WorkerContext, job: Job) -> None:
    hook = FAILURE_HOOKS.get(job.kind)
    if hook is not None:
        await hook(context, job)


def job_fields(job: Job) -> dict:
    return {"job_id": str(job.id), "kind": job.kind, "attempt": job.attempts}


async def handle_job(context: WorkerContext, job: Job) -> None:
    handler = HANDLERS[job.kind]
    token = request_id_var.set(job.payload.get("request_id"))
    heartbeat = asyncio.create_task(keep_lease(context, job))
    try:
        await handler(context, job)
        logger.info("job_done", extra=job_fields(job))
    except JobFailure as error:
        settings = context.settings
        if error.deferred and job.deferrals < settings.rate_limit_deferrals:
            delay = deferral_delay(
                job.deferrals + 1, settings.rate_limit_delay, settings.rate_limit_max_delay
            )
            async with context.sessions() as session:
                await defer_job(session, job, error.code, delay)
            logger.info("job_deferred", extra={**job_fields(job), "error": error.code})
            return
        async with context.sessions() as session:
            failed = await retry_or_fail(
                session, job, error.code, settings.retry_delay, error.retryable
            )
        logger.info("job_retry", extra={**job_fields(job), "error": error.code, "failed": failed})
        if failed:
            await report_failure(context, job)
    finally:
        heartbeat.cancel()
        request_id_var.reset(token)


async def fail_abandoned_jobs(context: WorkerContext) -> None:
    async with context.sessions() as session:
        jobs = await fail_stuck_jobs(session)
    for job in jobs:
        await report_failure(context, job)


def full_kinds(running: Iterable[str], limits: dict[str, int]) -> tuple[str, ...]:
    counts = Counter(running)
    return tuple(kind for kind, limit in limits.items() if counts[kind] >= limit)


async def run_worker(context: WorkerContext) -> None:
    slots = asyncio.Semaphore(context.settings.worker_concurrency)
    limits = {WORK_ANALYSIS_JOB: context.settings.analysis_concurrency}
    running: dict[asyncio.Task, str] = {}

    def on_done(task: asyncio.Task) -> None:
        running.pop(task, None)
        slots.release()
        if not task.cancelled() and task.exception():
            logger.error("job_crashed", exc_info=task.exception())

    while True:
        await slots.acquire()
        async with context.sessions() as session:
            job = await claim_job(
                session, context.settings.lease_seconds, full_kinds(running.values(), limits)
            )
        if job is None:
            slots.release()
            await fail_abandoned_jobs(context)
            await asyncio.sleep(context.settings.poll_seconds)
            continue
        task = asyncio.create_task(handle_job(context, job))
        running[task] = job.kind
        task.add_done_callback(on_done)


async def beat(path: Path, seconds: float) -> None:
    while True:
        write_heartbeat(path)
        await asyncio.sleep(seconds)


async def main() -> None:
    settings = Settings()
    configure_logging(settings.log_format, settings.log_level)
    tables = configure_models()
    engine = make_engine(settings.database_url, settings.db_pool_size)
    variant = get_variant(settings.analysis_variant)
    analysis_provider = make_provider(variant, settings)
    provider = Provider(
        settings.provider_url, settings.provider_timeout, settings.provider_concurrency
    )
    storage = await S3Storage.connect(settings)
    mailer = SmtpMailer(settings)
    context = WorkerContext(
        make_session_factory(engine),
        provider,
        settings,
        storage,
        mailer,
        analysis_provider,
        variant,
        code_commit(settings),
    )
    logger.info(
        "worker_started",
        extra={
            "concurrency": settings.worker_concurrency,
            "tables": len(tables),
            "variant": variant.name,
            "code_commit": context.code_commit,
        },
    )
    heartbeat = asyncio.create_task(
        beat(Path(settings.heartbeat_file), settings.heartbeat_file_seconds)
    )
    try:
        await run_worker(context)
    finally:
        heartbeat.cancel()
        await storage.close()
        await analysis_provider.close()
        await provider.close()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
