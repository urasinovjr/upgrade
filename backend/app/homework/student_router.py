import json
from collections import Counter
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.access.current import load_current_account
from app.access.router import RateLimited, set_session_cookie
from app.access.sessions import create_session, revoke_user_sessions
from app.billing import current_state
from app.dependencies import SessionDep, SettingsDep, StorageDep
from app.errors import DomainError
from app.homework.access import activate_student, login_student
from app.homework.http_contracts import SUBMISSION_REQUEST
from app.homework.models import Assignment, Homework, HomeworkFile, StudentAccess
from app.homework.outputs import (
    StudentLoginOut,
    StudentSessionOut,
    StudentStateOut,
    StudentSubmissionOut,
)
from app.homework.schemas import ActivateIn, StudentLoginIn, SubmissionIn
from app.homework.submissions import assignment_for, published_task, submit
from app.knowledge.models import Closure
from app.students.models import Student
from app.works.models import Work, WorkFile, WorkRevision
from app.works.schemas import Draft

router = APIRouter(prefix="/student", tags=["student"])


async def current_student(request: Request, session: SessionDep, settings: SettingsDep):
    current = await load_current_account(request, session, settings)
    access = await session.scalar(
        select(StudentAccess).where(StudentAccess.user_id == current.user.id)
    )
    if access is None:
        raise DomainError("student_required")
    student = await session.get(Student, access.student_id)
    if student is None:
        raise DomainError("student_required")
    return student, access, current


StudentDep = Annotated[tuple, Depends(current_student)]


async def student_session(session, settings, response, access):
    token, csrf = await create_session(session, access.user_id, settings.session_days)
    await session.commit()
    set_session_cookie(response, settings, token)
    return {"login": access.login, "csrfToken": csrf}


@router.post("/activate", dependencies=RateLimited, response_model=StudentLoginOut)
async def activate(
    data: ActivateIn, session: SessionDep, settings: SettingsDep, response: Response
):
    access = await activate_student(session, data.token, data.password)
    return await student_session(session, settings, response, access)


@router.post("/login", dependencies=RateLimited, response_model=StudentLoginOut)
async def login(
    data: StudentLoginIn, session: SessionDep, settings: SettingsDep, response: Response
):
    access = await login_student(session, data.login, data.password)
    return await student_session(session, settings, response, access)


@router.get("/session", response_model=StudentSessionOut)
async def get_session(current: StudentDep, session: SessionDep):
    student, access, account = current
    state = await current_state(session, student.teacher_id)
    return {
        "id": str(student.id),
        "name": student.name,
        "login": access.login,
        "grade": student.grade,
        "csrfToken": account.session.csrf_token,
        "writable": state.active,
    }


@router.post("/logout", status_code=204)
async def logout(
    current: StudentDep, session: SessionDep, settings: SettingsDep, response: Response
):
    await revoke_user_sessions(session, current[1].user_id)
    await session.commit()
    response.delete_cookie(settings.session_cookie_name, path="/")


@router.get("/state", response_model=StudentStateOut)
async def state(current: StudentDep, session: SessionDep):
    student = current[0]
    assignments = list(
        await session.scalars(
            select(Assignment)
            .where(Assignment.student_id == student.id)
            .order_by(Assignment.created_at.desc())
        )
    )
    result = []
    for assignment in assignments:
        homework = await session.get(Homework, assignment.homework_id)
        condition_ids = {
            UUID(file_id) for task in homework.tasks for file_id in task.get("conditionFileIds", [])
        }
        files = list(
            await session.scalars(
                select(HomeworkFile)
                .where(HomeworkFile.homework_id == homework.id, HomeworkFile.id.in_(condition_ids))
                .order_by(HomeworkFile.name, HomeworkFile.id)
            )
        )
        result.append(
            {
                "id": str(assignment.id),
                "title": homework.title,
                "tasks": homework.tasks,
                "files": [
                    {
                        "id": str(file.id),
                        "name": file.name,
                        "type": file.content_type,
                        "pages": file.pages,
                        "masks": {},
                        "checkedPages": [],
                    }
                    for file in files
                ],
                "deadline": homework.deadline.isoformat() if homework.deadline else None,
            }
        )
    works = list(
        await session.scalars(
            select(Work)
            .where(Work.student_id == student.id)
            .order_by(Work.created_at.desc(), Work.id.desc())
        )
    )
    submissions = []
    gaps = {}
    attempts = Counter(work.assignment_id or work.id for work in works)
    for work in works:
        group = work.assignment_id or work.id
        attempt_number = attempts[group]
        attempts[group] -= 1
        revision = (
            await session.get(WorkRevision, work.current_revision_id)
            if work.current_revision_id
            else None
        )
        draft = Draft.model_validate(revision.draft) if revision else None
        tasks = [published_task(task) for task in draft.tasks] if draft else []
        submissions.append(
            {
                "id": str(work.id),
                "assignmentId": str(work.assignment_id) if work.assignment_id else None,
                "title": work.title,
                "attemptNumber": attempt_number,
                "late": work.late,
                "submittedAt": (work.submitted_at or work.created_at).isoformat(),
                "status": "published" if revision else "submitted",
                "result": {"tasks": tasks, "feedback": draft.feedback} if draft else None,
            }
        )
        for task in tasks:
            if task["gap"]:
                gaps.setdefault(task["gap"]["topicId"], task["gap"])
    closures = await session.scalars(
        select(Closure).where(Closure.student_id == student.id).order_by(Closure.created_at)
    )
    for closure in closures:
        if closure.topic_id in gaps:
            gaps[closure.topic_id]["closed"] = closure.action == "close"
    return {"assignments": result, "submissions": submissions, "knowledge": list(gaps.values())}


@router.post(
    "/assignments/{assignment_id}/submissions",
    response_model=StudentSubmissionOut,
    openapi_extra=SUBMISSION_REQUEST,
)
async def post_submission(
    assignment_id: UUID,
    request: Request,
    current: StudentDep,
    session: SessionDep,
    settings: SettingsDep,
    storage: StorageDep,
):
    student = current[0]
    if not (await current_state(session, student.teacher_id)).active:
        raise DomainError("subscription_inactive")
    if student.archived_at is not None:
        raise DomainError("student_not_found")
    assignment = await assignment_for(session, assignment_id, student.teacher_id, student.id)
    work = await receive_submission(request, session, settings, storage, assignment)
    return {"id": str(work.id), "late": work.late, "status": "submitted"}


async def receive_submission(request, session, settings, storage, assignment):
    limit = settings.max_files_per_work * settings.max_file_bytes + 1024 * 1024
    if int(request.headers.get("content-length") or 0) > limit:
        raise DomainError("request_too_large")
    async with request.form(max_files=settings.max_files_per_work, max_fields=1) as form:
        raw = form.get("meta")
        try:
            data = SubmissionIn.model_validate(json.loads(raw))
        except (ValueError, TypeError) as error:
            raise DomainError("work_meta_invalid") from error
        uploads = {key: value for key, value in form.items() if key != "meta"}
        if any(isinstance(value, str) for value in uploads.values()):
            raise DomainError("attachments_mismatch")
        return await submit(session, storage, settings, assignment, data, uploads)


@router.get("/files/{file_id}")
async def file(file_id: UUID, current: StudentDep, session: SessionDep, storage: StorageDep):
    student = current[0]
    found = await session.scalar(
        select(WorkFile)
        .join(Work, Work.id == WorkFile.work_id)
        .where(WorkFile.id == file_id, Work.student_id == student.id)
    )
    if found is None:
        found = await session.scalar(
            select(HomeworkFile)
            .join(Assignment, Assignment.homework_id == HomeworkFile.homework_id)
            .where(HomeworkFile.id == file_id, Assignment.student_id == student.id)
        )
    if found is None:
        raise DomainError("file_not_found")
    if isinstance(found, HomeworkFile):
        homework = await session.get(Homework, found.homework_id)
        allowed = {
            file_id for task in homework.tasks for file_id in task.get("conditionFileIds", [])
        }
        if str(file_id) not in allowed:
            raise DomainError("file_not_found")
    return StreamingResponse(
        await storage.open(found.storage_key),
        media_type=found.content_type,
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"},
    )
