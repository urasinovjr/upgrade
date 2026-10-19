from datetime import timedelta
from uuid import UUID

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Job, Result
from app.services.processing import retry_delay


def seconds_from_now(seconds: float):
    return func.clock_timestamp() + timedelta(seconds=seconds)


async def claim_job(session: AsyncSession, lease_seconds: float, max_attempts: int) -> Job | None:
    now = func.clock_timestamp()
    waiting = and_(Job.status.in_(["queued", "retrying"]), Job.run_after <= now)
    abandoned = and_(Job.status == "running", Job.lease_until < now, Job.attempts < max_attempts)
    query = (
        select(Job)
        .where(or_(waiting, abandoned))
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


async def finish_job(
    session: AsyncSession, job_id: UUID, work_id: UUID, text: str, analysis: dict
) -> None:
    await session.execute(
        insert(Result)
        .values(work_id=work_id, text=text, analysis=analysis)
        .on_conflict_do_nothing(index_elements=["work_id"])
    )
    await session.execute(
        update(Job)
        .where(Job.id == job_id)
        .values(status="done", lease_until=None, finished_at=func.clock_timestamp())
    )
    await session.commit()


async def retry_or_fail(
    session: AsyncSession,
    job_id: UUID,
    attempts: int,
    error_code: str,
    max_attempts: int,
    base_delay: float,
) -> None:
    if attempts >= max_attempts:
        values = {"status": "failed", "finished_at": func.clock_timestamp()}
    else:
        values = {
            "status": "retrying",
            "run_after": seconds_from_now(retry_delay(attempts, base_delay)),
        }
    await session.execute(
        update(Job)
        .where(Job.id == job_id, Job.status == "running")
        .values(last_error=error_code, lease_until=None, **values)
    )
    await session.commit()


async def fail_stuck_jobs(session: AsyncSession, max_attempts: int) -> None:
    await session.execute(
        update(Job)
        .where(
            Job.status == "running",
            Job.lease_until < func.clock_timestamp(),
            Job.attempts >= max_attempts,
        )
        .values(status="failed", last_error="lease_expired", finished_at=func.clock_timestamp())
    )
    await session.commit()
