from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.files import enqueue_file_cleanup, work_prefix
from app.students import owned_student
from app.works.models import Work
from app.works.service import owned_work


async def delete_work(
    session: AsyncSession, settings: Settings, teacher_id: UUID, work_id: UUID
) -> None:
    work = await owned_work(session, teacher_id, work_id, lock=True)
    await enqueue_file_cleanup(
        session, work.id, [work_prefix(teacher_id, work.id)], settings.cleanup_job_attempts
    )
    await session.delete(work)
    await session.commit()


async def delete_student(
    session: AsyncSession, settings: Settings, teacher_id: UUID, student_id: UUID
) -> None:
    student = await owned_student(session, teacher_id, student_id)
    work_ids = list(
        await session.scalars(
            select(Work.id).where(Work.teacher_id == teacher_id, Work.student_id == student_id)
        )
    )
    if work_ids:
        prefixes = [work_prefix(teacher_id, work_id) for work_id in work_ids]
        await enqueue_file_cleanup(session, student.id, prefixes, settings.cleanup_job_attempts)
    await session.delete(student)
    await session.commit()
