from datetime import timedelta
from uuid import UUID

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.queue.models import Job
from app.queue.retry import retry_delay


class JobFailure(Exception):
    def __init__(self, code: str, retryable: bool = True, deferred: bool = False):
        super().__init__(code)
        self.code = code
        self.retryable = retryable
        self.deferred = deferred


def seconds_from_now(seconds: float):
    return func.clock_timestamp() + timedelta(seconds=seconds)


async def enqueue(
    session: AsyncSession,
    kind: str,
    subject_id: UUID,
    max_attempts: int,
    payload: dict | None = None,
    dedupe_key: str | None = None,
) -> Job:
    values = {
        "kind": kind,
        "subject_id": subject_id,
        "payload": payload or {},
        "dedupe_key": dedupe_key,
        "max_attempts": max_attempts,
        "status": "queued",
        "attempts": 0,
    }
    statement = insert(Job).values(**values).returning(Job)
    if dedupe_key is not None:
        statement = statement.on_conflict_do_nothing(index_elements=["dedupe_key"])
    job = await session.scalar(statement)
    if job is None:
        job = await session.scalar(select(Job).where(Job.dedupe_key == dedupe_key))
    assert job is not None
    return job


async def claim_job(
    session: AsyncSession, lease_seconds: float, skip_kinds: tuple[str, ...] = ()
) -> Job | None:
    now = func.clock_timestamp()
    waiting = and_(Job.status.in_(["queued", "retrying"]), Job.run_after <= now)
    abandoned = and_(
        Job.status == "running", Job.lease_until < now, Job.attempts < Job.max_attempts
    )
    query = (
        select(Job)
        .where(or_(waiting, abandoned), Job.kind.not_in(skip_kinds))
        .order_by(Job.run_after)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    job = await session.scalar(query)
    if job is None:
        await session.rollback()
        return None
    job.status = "running"
    job.attempts += 1
    job.lease_until = seconds_from_now(lease_seconds)
    await session.commit()
    return job


async def extend_lease(session: AsyncSession, job_id: UUID, lease_seconds: float) -> None:
    await session.execute(
        update(Job)
        .where(Job.id == job_id, Job.status == "running")
        .values(lease_until=seconds_from_now(lease_seconds))
    )
    await session.commit()


async def complete_job(session: AsyncSession, job_id: UUID, payload: dict | None = None) -> None:
    values = {"status": "done", "lease_until": None, "finished_at": func.clock_timestamp()}
    if payload is not None:
        values["payload"] = payload
    await session.execute(update(Job).where(Job.id == job_id).values(**values))


async def retry_or_fail(
    session: AsyncSession, job: Job, error_code: str, base_delay: float, retryable: bool = True
) -> bool:
    failed = not retryable or job.attempts >= job.max_attempts
    if failed:
        values = {"status": "failed", "finished_at": func.clock_timestamp()}
    else:
        values = {
            "status": "retrying",
            "run_after": seconds_from_now(retry_delay(job.attempts, base_delay)),
        }
    await session.execute(
        update(Job)
        .where(Job.id == job.id, Job.status == "running")
        .values(last_error=error_code, lease_until=None, **values)
    )
    await session.commit()
    return failed


async def defer_job(session: AsyncSession, job: Job, error_code: str, delay: float) -> None:
    await session.execute(
        update(Job)
        .where(Job.id == job.id, Job.status == "running")
        .values(
            status="retrying",
            attempts=Job.attempts - 1,
            deferrals=Job.deferrals + 1,
            run_after=seconds_from_now(delay),
            last_error=error_code,
            lease_until=None,
        )
    )
    await session.commit()


async def fail_stuck_jobs(session: AsyncSession) -> list[Job]:
    result = await session.scalars(
        update(Job)
        .where(
            Job.status == "running",
            Job.lease_until < func.clock_timestamp(),
            Job.attempts >= Job.max_attempts,
        )
        .values(status="failed", last_error="lease_expired", finished_at=func.clock_timestamp())
        .returning(Job)
    )
    jobs = list(result)
    await session.commit()
    return jobs
