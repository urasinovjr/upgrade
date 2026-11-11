from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import DomainError
from app.events import record_event
from app.homework.models import Assignment, Homework, HomeworkFile, HomeworkJob
from app.homework.schemas import AssignIn, HomeworkSave, HomeworkTask
from app.knowledge.catalog import KNOWN_TOPICS
from app.knowledge.task_types import TASK_TYPE_IDS
from app.students import owned_student
from app.works.service import dump


async def owned_homework(
    session: AsyncSession, teacher_id: UUID, homework_id: UUID, lock: bool = False
) -> Homework:
    query = select(Homework).where(Homework.id == homework_id, Homework.teacher_id == teacher_id)
    if lock:
        query = query.with_for_update()
    homework = await session.scalar(query)
    if homework is None:
        raise DomainError("homework_not_found")
    return homework


def require_draft(homework: Homework) -> None:
    if homework.assigned_at is not None:
        raise DomainError("homework_frozen")


def require_revision(homework: Homework, revision: int) -> None:
    if homework.revision != revision:
        raise DomainError("draft_conflict", {"revision": homework.revision})


async def describe_homework(session: AsyncSession, homework: Homework) -> dict:
    job_id = await session.scalar(
        select(HomeworkJob.id)
        .where(HomeworkJob.homework_id == homework.id, HomeworkJob.kind == "condition_recognition")
        .order_by(HomeworkJob.created_at.desc())
        .limit(1)
    )
    files = await session.scalars(
        select(HomeworkFile)
        .where(HomeworkFile.homework_id == homework.id)
        .order_by(HomeworkFile.name, HomeworkFile.id)
    )
    assignments = await session.scalars(
        select(Assignment).where(Assignment.homework_id == homework.id)
    )
    return {
        "id": str(homework.id),
        "title": homework.title,
        "revision": homework.revision,
        "tasks": homework.tasks,
        "sourceText": homework.source_text,
        "recognitionJobId": str(job_id) if job_id else None,
        "assignedAt": homework.assigned_at.isoformat() if homework.assigned_at else None,
        "deadline": homework.deadline.isoformat() if homework.deadline else None,
        "createdAt": homework.created_at.isoformat(),
        "files": [
            {
                "id": str(file.id),
                "name": file.name,
                "type": file.content_type,
                "pages": file.pages,
                "masks": file.masks,
                "checkedPages": file.checked_pages,
            }
            for file in files
        ],
        "assignments": [
            {"id": str(item.id), "studentId": str(item.student_id)} for item in assignments
        ],
    }


async def save_homework(
    session: AsyncSession, teacher_id: UUID, homework_id: UUID, data: HomeworkSave
) -> Homework:
    homework = await session.scalar(
        select(Homework).where(Homework.id == homework_id).with_for_update()
    )
    if homework is None:
        if data.base_revision != 0:
            raise DomainError("homework_not_found")
        homework = Homework(id=homework_id, teacher_id=teacher_id, revision=0, title=data.title)
        session.add(homework)
    elif homework.teacher_id != teacher_id:
        raise DomainError("homework_not_found")
    require_draft(homework)
    require_revision(homework, data.base_revision)
    files = set(
        await session.scalars(
            select(HomeworkFile.id).where(HomeworkFile.homework_id == homework_id)
        )
    )
    for task in data.tasks:
        if not set(task.condition_file_ids) <= files:
            raise DomainError("attachments_mismatch")
        if task.topic_id and task.topic_id not in KNOWN_TOPICS:
            raise DomainError("topic_unknown")
        if task.task_type_id and task.task_type_id not in TASK_TYPE_IDS:
            raise DomainError("work_meta_invalid")
        if task.confirmed and not (task.condition.strip() or task.formula.strip()):
            raise DomainError("homework_unconfirmed")
    homework.title = data.title
    homework.tasks = [dump(task) for task in data.tasks]
    if data.source_text is not None:
        homework.source_text = data.source_text
    homework.revision += 1
    await record_event(session, teacher_id, "homework_created", homework.id)
    await session.commit()
    await session.refresh(homework)
    return homework


async def assign_homework(
    session: AsyncSession, teacher_id: UUID, homework_id: UUID, data: AssignIn
) -> Homework:
    homework = await owned_homework(session, teacher_id, homework_id, lock=True)
    require_draft(homework)
    require_revision(homework, data.base_revision)
    tasks = [HomeworkTask.model_validate(task) for task in homework.tasks]
    if not tasks or any(not task.confirmed for task in tasks):
        raise DomainError("homework_unconfirmed")
    for student_id in set(data.student_ids):
        student = await owned_student(session, teacher_id, student_id)
        if student.archived_at is not None:
            raise DomainError("student_not_found")
        session.add(
            Assignment(teacher_id=teacher_id, student_id=student_id, homework_id=homework.id)
        )
    homework.assigned_at = datetime.now(UTC)
    homework.deadline = data.deadline
    homework.revision += 1
    await record_event(session, teacher_id, "homework_assigned", homework.id)
    await session.commit()
    return homework
