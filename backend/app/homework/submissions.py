from datetime import UTC, datetime
from io import BytesIO
from uuid import UUID, uuid5

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import DomainError
from app.events import record_event
from app.files import Storage
from app.homework.models import Assignment, Homework, HomeworkFile
from app.homework.schemas import HomeworkTask, SubmissionIn
from app.works.models import Work, WorkFile
from app.works.schemas import AttachmentMeta, Task, WorkCreateMeta
from app.works.service import read_draft
from app.works.uploads import create_work


async def read_object(storage: Storage, key: str) -> bytes:
    chunks = await storage.open(key)
    return b"".join([chunk async for chunk in chunks])


async def assignment_for(
    session: AsyncSession, assignment_id: UUID, teacher_id: UUID, student_id: UUID | None = None
) -> Assignment:
    query = select(Assignment).where(
        Assignment.id == assignment_id, Assignment.teacher_id == teacher_id
    )
    if student_id is not None:
        query = query.where(Assignment.student_id == student_id)
    assignment = await session.scalar(query.with_for_update())
    if assignment is None:
        raise DomainError("assignment_not_found")
    return assignment


def submission_task(task: HomeworkTask, file_ids: list[UUID], copies: dict[UUID, UUID]) -> Task:
    return Task(
        id=str(task.id),
        title=task.title,
        condition=task.condition,
        formula=task.formula,
        reference="",
        topic_id=task.topic_id,
        task_type_id=task.task_type_id,
        condition_attachment_ids=[str(copies[item]) for item in task.condition_file_ids],
        solution_attachment_ids=[str(item) for item in file_ids],
        steps=[],
        feedback="" if file_ids else "Решение не прислано",
        reviewed=False,
        omitted=not file_ids,
    )


async def submit(
    session: AsyncSession,
    storage: Storage,
    settings: Settings,
    assignment: Assignment,
    data: SubmissionIn,
    uploads: dict[str, UploadFile],
) -> Work:
    existing = await session.get(Work, data.id)
    if existing is not None:
        if existing.assignment_id != assignment.id:
            raise DomainError("work_exists")
        return existing
    previous = await session.scalar(
        select(Work)
        .where(Work.assignment_id == assignment.id)
        .order_by(Work.created_at.desc())
        .limit(1)
    )
    if previous is not None and previous.current_revision_id is None:
        raise DomainError("submission_pending")
    homework = await session.get(Homework, assignment.homework_id, with_for_update=True)
    tasks = [HomeworkTask.model_validate(task) for task in homework.tasks]
    if not set(data.task_files) <= {str(task.id) for task in tasks}:
        raise DomainError("attachments_mismatch")
    attached = [str(item) for group in data.task_files.values() for item in group]
    if len(attached) != len(set(attached)) or set(attached) != set(uploads):
        raise DomainError("attachments_mismatch")
    await record_event(session, assignment.teacher_id, "submission_received", data.id)
    condition_ids = {item for task in tasks for item in task.condition_file_ids}
    condition_files = list(
        await session.scalars(
            select(HomeworkFile)
            .where(HomeworkFile.homework_id == homework.id, HomeworkFile.id.in_(condition_ids))
            .order_by(HomeworkFile.name, HomeworkFile.id)
        )
    )
    copies = {file.id: uuid5(data.id, str(file.id)) for file in condition_files}
    if set(copies.values()) & {UUID(item) for item in attached}:
        raise DomainError("attachments_mismatch")
    all_uploads = dict(uploads)
    meta_files = [
        AttachmentMeta(id=UUID(key), name=(upload.filename or "Решение")[:255])
        for key, upload in uploads.items()
    ]
    for file in condition_files:
        copied_id = copies[file.id]
        all_uploads[str(copied_id)] = UploadFile(
            BytesIO(await read_object(storage, file.storage_key)), filename=file.name
        )
        meta_files.append(AttachmentMeta(id=copied_id, name=file.name))
    meta = WorkCreateMeta(
        id=data.id,
        student_id=assignment.student_id,
        title=homework.title,
        attachments=meta_files,
        tasks=[
            submission_task(task, data.task_files.get(str(task.id), []), copies) for task in tasks
        ],
    )
    work = await create_work(
        session, storage, settings, assignment.teacher_id, meta, all_uploads, commit=False
    )
    for file in condition_files:
        copied = await session.get(WorkFile, copies[file.id])
        copied.masks = file.masks
        copied.checked_pages = file.checked_pages
    work.assignment_id = assignment.id
    work.submission_snapshot = {
        "homeworkId": str(homework.id),
        "title": homework.title,
        "tasks": homework.tasks,
        "revision": homework.revision,
        "deadline": homework.deadline.isoformat() if homework.deadline else None,
    }
    work.task_files = {
        key: [str(item) for item in values] for key, values in data.task_files.items()
    }
    work.submitted_at = datetime.now(UTC)
    work.late = homework.deadline is not None and work.submitted_at > homework.deadline
    await record_event(session, work.teacher_id, "submission_stored", work.id)
    await session.commit()
    return work


def frozen_conditions(work: Work, proposed) -> None:
    if work.submission_snapshot is None:
        return
    stored = read_draft(work)
    fields = (
        "id",
        "title",
        "condition",
        "formula",
        "condition_attachment_ids",
        "solution_attachment_ids",
    )
    before = [{field: getattr(task, field) for field in fields} for task in stored.tasks]
    after = [{field: getattr(task, field) for field in fields} for task in proposed.tasks]
    if before != after:
        raise DomainError("homework_frozen")


def published_task(task: Task) -> dict:
    result = task.result
    if result is None:
        if (
            task.omitted
            or not task.steps
            or any(step.verdict == "uncertain" for step in task.steps)
        ):
            result = "needs_clarification"
        elif any(step.verdict == "error" for step in task.steps):
            result = "errors"
        else:
            result = "solved"
    gap = (
        task.gap
        if task.steps and not task.omitted and task.gap and task.gap.decision == "confirmed"
        else None
    )
    return {
        "id": task.id,
        "title": task.title,
        "condition": task.condition,
        "formula": task.formula,
        "steps": [
            {
                "id": step.id,
                "latex": step.latex,
                "verdict": step.verdict,
                "explanation": step.explanation,
            }
            for step in task.steps
        ],
        "feedback": task.feedback,
        "result": result,
        "gap": {"topicId": gap.topic_id, "reason": gap.reason} if gap else None,
    }
