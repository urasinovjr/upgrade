from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.provider import Provider
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
