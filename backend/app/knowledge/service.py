from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import DomainError
from app.knowledge.models import Closure
from app.knowledge.schemas import ClosureIn
from app.students import owned_student


async def add_closure(
    session: AsyncSession, teacher_id: UUID, student_id: UUID, data: ClosureIn
) -> Closure:
    await owned_student(session, teacher_id, student_id)
    if data.action == "close" and not data.note.strip():
        raise DomainError("closure_note_required")
    closure = Closure(
        teacher_id=teacher_id,
        student_id=student_id,
        topic_id=data.topic_id,
        action=data.action,
        note=data.note.strip(),
    )
    session.add(closure)
    await session.commit()
    await session.refresh(closure)
    return closure


async def list_closures(session: AsyncSession, teacher_id: UUID) -> list[Closure]:
    rows = await session.scalars(
        select(Closure).where(Closure.teacher_id == teacher_id).order_by(Closure.created_at)
    )
    return list(rows)
