from uuid import UUID, uuid4

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.dependencies import (
    CurrentAccountDep,
    SessionDep,
    SettingsDep,
    StorageDep,
    WritableAccountDep,
)
from app.errors import DomainError
from app.events import record_event
from app.homework.access import invite_student
from app.homework.exams import exam_catalog
from app.homework.http_contracts import HOMEWORK_FILE_REQUEST, SUBMISSION_REQUEST
from app.homework.models import Homework, HomeworkFile, HomeworkJob
from app.homework.outputs import ExamCatalogOut, HomeworkJobOut, HomeworkOut, InvitationOut
from app.homework.schemas import (
    AssignIn,
    DeadlineIn,
    HomeworkSave,
    MaterialContent,
    MaterialIn,
    RecognizeIn,
)
from app.homework.service import (
    assign_homework,
    describe_homework,
    owned_homework,
    require_draft,
    require_revision,
    save_homework,
)
from app.homework.student_router import receive_submission
from app.homework.submissions import assignment_for, read_object
from app.homework.tasks import enqueue_material, enqueue_recognition, job_out
from app.works.page_checks import stored_masks, valid_masks
from app.works.schemas import AttachmentLayout, WorkOut
from app.works.service import describe_work, dump
from app.works.uploads import read_upload

router = APIRouter(tags=["homework"])


@router.get("/homework/exams", response_model=list[ExamCatalogOut])
async def exams(current: CurrentAccountDep):
    return exam_catalog()


@router.get("/homework", response_model=list[HomeworkOut])
async def list_homework(current: CurrentAccountDep, session: SessionDep):
    homeworks = await session.scalars(
        select(Homework)
        .where(Homework.teacher_id == current.user.id)
        .order_by(Homework.created_at.desc())
    )
    return [await describe_homework(session, item) for item in homeworks]


@router.get("/homework/{homework_id}", response_model=HomeworkOut)
async def get_homework(homework_id: UUID, current: CurrentAccountDep, session: SessionDep):
    return await describe_homework(
        session, await owned_homework(session, current.user.id, homework_id)
    )


@router.put("/homework/{homework_id}", response_model=HomeworkOut)
async def save(
    homework_id: UUID, data: HomeworkSave, current: WritableAccountDep, session: SessionDep
):
    return await describe_homework(
        session, await save_homework(session, current.user.id, homework_id, data)
    )


@router.post("/homework/{homework_id}/assign", response_model=HomeworkOut)
async def assign(
    homework_id: UUID, data: AssignIn, current: WritableAccountDep, session: SessionDep
):
    homework = await assign_homework(session, current.user.id, homework_id, data)
    return await describe_homework(session, homework)


@router.put("/homework/{homework_id}/deadline", response_model=HomeworkOut)
async def deadline(
    homework_id: UUID, data: DeadlineIn, current: WritableAccountDep, session: SessionDep
):
    homework = await owned_homework(session, current.user.id, homework_id, lock=True)
    if homework.deadline != data.deadline:
        homework.deadline = data.deadline
        homework.revision += 1
        await record_event(
            session, current.user.id, "deadline_changed", homework.id, homework.revision
        )
    await session.commit()
    return await describe_homework(session, homework)


@router.post("/homework/{homework_id}/copy", response_model=HomeworkOut)
async def copy(
    homework_id: UUID, current: WritableAccountDep, session: SessionDep, storage: StorageDep
):
    original = await owned_homework(session, current.user.id, homework_id, lock=True)
    copied = Homework(
        teacher_id=current.user.id,
        title=original.title,
        revision=1,
        tasks=[],
        source_text=original.source_text,
    )
    session.add(copied)
    await session.flush()
    files = list(
        await session.scalars(
            select(HomeworkFile)
            .where(HomeworkFile.homework_id == original.id)
            .order_by(HomeworkFile.name, HomeworkFile.id)
        )
    )
    ids = {}
    for file in files:
        new_id = uuid4()
        ids[str(file.id)] = str(new_id)
        key = f"teachers/{current.user.id}/homework/{copied.id}/{new_id}"
        await storage.put(key, await read_object(storage, file.storage_key), file.content_type)
        session.add(
            HomeworkFile(
                id=new_id,
                teacher_id=current.user.id,
                homework_id=copied.id,
                name=file.name,
                content_type=file.content_type,
                size=file.size,
                pages=file.pages,
                storage_key=key,
                masks=file.masks,
                checked_pages=file.checked_pages,
            )
        )
    copied.tasks = [
        {**task, "conditionFileIds": [ids[item] for item in task.get("conditionFileIds", [])]}
        for task in original.tasks
    ]
    await record_event(session, current.user.id, "homework_created", copied.id)
    await session.commit()
    return await describe_homework(session, copied)


@router.post("/students/{student_id}/invitation", response_model=InvitationOut)
async def invitation(
    student_id: UUID, current: WritableAccountDep, session: SessionDep, settings: SettingsDep
):
    result = await invite_student(session, current.user.id, student_id)
    return {
        "login": result["login"],
        "url": settings.public_url.rstrip("/") + "/student/activate#" + result["token"],
    }


@router.post(
    "/assignments/{assignment_id}/submissions",
    response_model=WorkOut,
    response_model_exclude_none=True,
    openapi_extra=SUBMISSION_REQUEST,
)
async def submission(
    assignment_id: UUID,
    request: Request,
    current: WritableAccountDep,
    session: SessionDep,
    settings: SettingsDep,
    storage: StorageDep,
):
    assignment = await assignment_for(session, assignment_id, current.user.id)
    return await describe_work(
        session, await receive_submission(request, session, settings, storage, assignment)
    )


@router.post(
    "/homework/{homework_id}/files", response_model=HomeworkOut, openapi_extra=HOMEWORK_FILE_REQUEST
)
async def upload_file(
    homework_id: UUID,
    request: Request,
    current: WritableAccountDep,
    session: SessionDep,
    settings: SettingsDep,
    storage: StorageDep,
):
    if int(request.headers.get("content-length") or 0) > settings.max_file_bytes + 1024 * 1024:
        raise DomainError("request_too_large")
    homework = await owned_homework(session, current.user.id, homework_id, lock=True)
    require_draft(homework)
    files = list(
        await session.scalars(
            select(HomeworkFile)
            .where(HomeworkFile.homework_id == homework_id)
            .order_by(HomeworkFile.name, HomeworkFile.id)
        )
    )
    async with request.form(max_files=1, max_fields=0) as form:
        upload = form.get("file")
        if upload is None or isinstance(upload, str):
            raise DomainError("attachments_mismatch")
        data, kind, pages = await read_upload(upload, settings)
        if (
            len(files) >= settings.max_files_per_work
            or pages + sum(file.pages for file in files) > settings.max_pages_per_work
        ):
            raise DomainError("too_many_pages")
        file_id = uuid4()
        key = f"teachers/{current.user.id}/homework/{homework.id}/{file_id}"
        await storage.put(key, data, kind)
        session.add(
            HomeworkFile(
                id=file_id,
                teacher_id=current.user.id,
                homework_id=homework.id,
                name=(upload.filename or "Условие")[:255],
                content_type=kind,
                size=len(data),
                pages=pages,
                storage_key=key,
                masks={},
                checked_pages=[],
            )
        )
    homework.revision += 1
    await session.commit()
    return await describe_homework(session, homework)


@router.put("/homework/{homework_id}/files/{file_id}", response_model=HomeworkOut)
async def file_layout(
    homework_id: UUID,
    file_id: UUID,
    data: AttachmentLayout,
    current: WritableAccountDep,
    session: SessionDep,
):
    homework = await owned_homework(session, current.user.id, homework_id, lock=True)
    require_draft(homework)
    file = await session.get(HomeworkFile, file_id)
    if file is None or file.homework_id != homework_id:
        raise DomainError("file_not_found")
    if data.id != file.id or not valid_masks(data, file.pages):
        raise DomainError("attachments_mismatch")
    masks = stored_masks(data)
    file.checked_pages = sorted(
        {
            page
            for page in data.checked_pages
            if 1 <= page <= file.pages and file.masks.get(str(page), []) == masks.get(str(page), [])
        }
    )
    if masks != file.masks:
        homework.revision += 1
        homework.tasks = [{**task, "confirmed": False} for task in homework.tasks]
    file.masks = masks
    await session.commit()
    return await describe_homework(session, homework)


@router.get("/homework-files/{file_id}")
async def get_file(
    file_id: UUID, current: CurrentAccountDep, session: SessionDep, storage: StorageDep
):
    file = await session.scalar(
        select(HomeworkFile).where(
            HomeworkFile.id == file_id, HomeworkFile.teacher_id == current.user.id
        )
    )
    if file is None:
        raise DomainError("file_not_found")
    return StreamingResponse(
        await storage.open(file.storage_key),
        media_type=file.content_type,
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"},
    )


@router.post("/homework/{homework_id}/recognize", response_model=HomeworkJobOut)
async def recognize(
    homework_id: UUID,
    data: RecognizeIn,
    current: WritableAccountDep,
    session: SessionDep,
    settings: SettingsDep,
):
    homework = await owned_homework(session, current.user.id, homework_id, lock=True)
    require_draft(homework)
    require_revision(homework, data.base_revision)
    job = await enqueue_recognition(session, settings, homework, data)
    return job_out(job)


@router.get("/homework-jobs/{job_id}", response_model=HomeworkJobOut)
async def get_job(job_id: UUID, current: CurrentAccountDep, session: SessionDep):
    job = await session.scalar(
        select(HomeworkJob).where(
            HomeworkJob.id == job_id, HomeworkJob.teacher_id == current.user.id
        )
    )
    if job is None:
        raise DomainError("material_not_found")
    return job_out(job)


@router.post("/materials", response_model=HomeworkJobOut)
async def generate_material(
    data: MaterialIn, current: WritableAccountDep, session: SessionDep, settings: SettingsDep
):
    return job_out(await enqueue_material(session, settings, current.user.id, data))


@router.get("/materials", response_model=list[HomeworkJobOut])
async def list_materials(work_id: UUID, current: CurrentAccountDep, session: SessionDep):
    jobs = await session.scalars(
        select(HomeworkJob)
        .where(
            HomeworkJob.teacher_id == current.user.id,
            HomeworkJob.work_id == work_id,
            HomeworkJob.kind == "remediation",
        )
        .order_by(HomeworkJob.created_at.desc())
    )
    return [job_out(job) for job in jobs]


@router.put("/materials/{job_id}", response_model=HomeworkJobOut)
async def save_material(
    job_id: UUID, data: MaterialContent, current: WritableAccountDep, session: SessionDep
):
    job = await session.scalar(
        select(HomeworkJob)
        .where(
            HomeworkJob.id == job_id,
            HomeworkJob.teacher_id == current.user.id,
            HomeworkJob.kind == "remediation",
        )
        .with_for_update()
    )
    if job is None or job.status != "ready":
        raise DomainError("material_not_found")
    job.result = dump(data)
    job.revision += 1
    await session.commit()
    return job_out(job)
