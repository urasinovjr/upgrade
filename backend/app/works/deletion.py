from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.access.models import User
from app.config import Settings
from app.files import enqueue_file_cleanup, work_prefix
from app.homework.models import StudentAccess
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
    access = await session.get(StudentAccess, student_id)
    login_user = await session.get(User, access.user_id) if access else None
    work_ids = list(
        await session.scalars(
            select(Work.id).where(Work.teacher_id == teacher_id, Work.student_id == student_id)
        )
    )
    if work_ids:
        prefixes = [work_prefix(teacher_id, work_id) for work_id in work_ids]
        await enqueue_file_cleanup(session, student.id, prefixes, settings.cleanup_job_attempts)
    await session.delete(student)
    if login_user:
        await session.delete(login_user)
    await session.commit()
