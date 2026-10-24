from datetime import timedelta

from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import DomainError
from app.provider import Provider, ProviderError
from app.queue import Job, enqueue
from app.stand.models import StandResult, StandWork
from app.stand.processing import run_with_retries
from app.stand.schemas import WorkCreate

STAND_JOB = "stand_analysis"


async def accept_work(
    session: AsyncSession, data: WorkCreate, upload_id: str, max_attempts: int
) -> Job:
    new_work = (
        insert(StandWork)
        .values(
            teacher_id=data.teacher_id,
            student_id=data.student_id,
            upload_id=upload_id,
            idempotency_key=upload_id,
            pages=data.pages,
        )
        .on_conflict_do_nothing(index_elements=["teacher_id", "idempotency_key"])
        .returning(StandWork.id)
    )
    work_id = await session.scalar(new_work)
    if work_id is not None:
        job = await enqueue(
            session, STAND_JOB, work_id, max_attempts, dedupe_key=f"stand:{work_id}"
        )
        await session.commit()
        return job

    existing = (
        select(Job)
        .join(StandWork, StandWork.id == Job.subject_id)
        .where(
            Job.kind == STAND_JOB,
            StandWork.teacher_id == data.teacher_id,
            StandWork.idempotency_key == upload_id,
        )
    )
    job = await session.scalar(existing)
    await session.commit()
    assert job is not None
    return job


async def process_now(
    session: AsyncSession,
    provider: Provider,
    settings: Settings,
    data: WorkCreate,
    upload_id: str,
) -> StandResult:
    work = StandWork(
        teacher_id=data.teacher_id,
        student_id=data.student_id,
        upload_id=upload_id,
        pages=data.pages,
    )
    session.add(work)
    await session.flush()
    text, analysis = await run_with_retries(
        provider, upload_id, data.pages, settings.sync_attempts, settings.retry_delay
    )
    result = StandResult(work_id=work.id, text=text, analysis=analysis)
    session.add(result)
    await session.commit()
    return result


async def claim_work(
    session: AsyncSession, data: WorkCreate, key: str, claim_seconds: float
) -> tuple[StandWork | None, StandResult | None]:
    claimed = await session.scalar(
        insert(StandWork)
        .values(
            teacher_id=data.teacher_id,
            student_id=data.student_id,
            upload_id=key,
            idempotency_key=key,
            pages=data.pages,
            claimed_at=func.clock_timestamp(),
        )
        .on_conflict_do_nothing(index_elements=["teacher_id", "idempotency_key"])
        .returning(StandWork)
    )
    if claimed is not None:
        await session.commit()
        return claimed, None
    work = await session.scalar(
        select(StandWork).where(
            StandWork.teacher_id == data.teacher_id, StandWork.idempotency_key == key
        )
    )
    assert work is not None
    result = await session.scalar(select(StandResult).where(StandResult.work_id == work.id))
    if result is not None:
        await session.commit()
        return None, result
    stale = func.clock_timestamp() - timedelta(seconds=claim_seconds)
    taken = await session.scalar(
        update(StandWork)
        .where(
            StandWork.id == work.id,
            or_(StandWork.claimed_at.is_(None), StandWork.claimed_at < stale),
        )
        .values(claimed_at=func.clock_timestamp())
        .returning(StandWork)
    )
    await session.commit()
    if taken is None:
        raise DomainError("work_in_progress")
    return taken, None


async def process_idempotent(
    session: AsyncSession,
    provider: Provider,
    settings: Settings,
    data: WorkCreate,
    key: str,
) -> StandResult:
    work, done = await claim_work(session, data, key, settings.sync_claim_seconds)
    if done is not None:
        return done
    assert work is not None
    try:
        text, analysis = await run_with_retries(
            provider, key, data.pages, settings.sync_attempts, settings.retry_delay
        )
    except ProviderError:
        await session.execute(
            update(StandWork).where(StandWork.id == work.id).values(claimed_at=None)
        )
        await session.commit()
        raise
    await session.execute(
        insert(StandResult)
        .values(work_id=work.id, text=text, analysis=analysis)
        .on_conflict_do_nothing(index_elements=["work_id"])
    )
    result = await session.scalar(select(StandResult).where(StandResult.work_id == work.id))
    await session.commit()
    assert result is not None
    return result
