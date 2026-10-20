from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import DomainError
from app.students.models import Student
from app.students.schemas import StudentIn


async def owned_student(session: AsyncSession, teacher_id: UUID, student_id: UUID) -> Student:
    student = await session.scalar(
        select(Student).where(Student.id == student_id, Student.teacher_id == teacher_id)
    )
    if student is None:
        raise DomainError("student_not_found")
    return student


async def save_student(
    session: AsyncSession, teacher_id: UUID, student_id: UUID, data: StudentIn
) -> Student:
    values = data.model_dump()
    statement = (
        insert(Student)
        .values(id=student_id, teacher_id=teacher_id, **values)
        .on_conflict_do_update(
            index_elements=["id"], set_=values, where=Student.teacher_id == teacher_id
        )
        .returning(Student)
    )
    student = await session.scalar(statement)
    if student is None:
        await session.rollback()
        raise DomainError("student_not_found")
    await session.commit()
    return student


async def set_archived(
    session: AsyncSession, teacher_id: UUID, student_id: UUID, archived: bool
) -> Student:
    student = await owned_student(session, teacher_id, student_id)
    if archived and student.archived_at is None:
        student.archived_at = datetime.now(UTC)
    if not archived:
        student.archived_at = None
    await session.commit()
    return student


async def list_students(session: AsyncSession, teacher_id: UUID) -> list[Student]:
    rows = await session.scalars(
        select(Student).where(Student.teacher_id == teacher_id).order_by(Student.created_at)
    )
    return list(rows)
