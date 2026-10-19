from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models import Job, Result, Work
from app.provider import Provider
from app.schemas import WorkCreate
from app.services.processing import run_with_retries


async def accept_work(session: AsyncSession, data: WorkCreate, upload_id: str) -> Job:
    new_work = (
        insert(Work)
        .values(
            teacher_id=data.teacher_id,
            student_id=data.student_id,
            upload_id=upload_id,
            idempotency_key=upload_id,
            pages=data.pages,
        )
        .on_conflict_do_nothing(index_elements=["teacher_id", "idempotency_key"])
        .returning(Work.id)
    )
    work_id = await session.scalar(new_work)
    if work_id is not None:
        job = Job(work_id=work_id)
        session.add(job)
        await session.commit()
        await session.refresh(job)
        return job

    existing = (
        select(Job)
        .join(Work, Work.id == Job.work_id)
        .where(Work.teacher_id == data.teacher_id, Work.idempotency_key == upload_id)
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
) -> Result:
    work = Work(
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
    result = Result(work_id=work.id, text=text, analysis=analysis)
    session.add(result)
    await session.commit()
    return result
