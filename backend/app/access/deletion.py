from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.access.models import User
from app.access.passwords import verify_password
from app.config import Settings
from app.errors import DomainError
from app.files import enqueue_file_cleanup, teacher_prefix
from app.homework.models import StudentAccess
from app.mail import SEND_EMAIL_JOB
from app.queue import Job
from app.students.models import Student


async def delete_account(
    session: AsyncSession, settings: Settings, user: User, password: str | None
) -> None:
    if user.password_hash is not None and not await verify_password(
        user.password_hash, password or ""
    ):
        raise DomainError("invalid_credentials")
    await session.execute(
        delete(Job).where(
            Job.kind == SEND_EMAIL_JOB,
            Job.subject_id == user.id,
            Job.status.in_(["queued", "retrying"]),
        )
    )
    await enqueue_file_cleanup(
        session, user.id, [teacher_prefix(user.id)], settings.cleanup_job_attempts
    )
    student_users = list(
        await session.scalars(
            select(StudentAccess.user_id)
            .join(Student, Student.id == StudentAccess.student_id)
            .where(Student.teacher_id == user.id)
        )
    )
    if student_users:
        await session.execute(delete(User).where(User.id.in_(student_users)))
    await session.execute(delete(User).where(User.id == user.id))
    await session.commit()
