import json
from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import ValidationError

from app.dependencies import (
    CurrentAccountDep,
    SessionDep,
    SettingsDep,
    StorageDep,
    WritableAccountDep,
)
from app.errors import DomainError
from app.files import StorageError
from app.works.actions import (
    owned_file,
    read_report,
    run_action,
    save_draft,
    sent_page,
    sent_pages,
    update_attachments,
)
from app.works.deletion import delete_student, delete_work
from app.works.schemas import (
    AttachmentLayout,
    DraftSavedOut,
    DraftSaveIn,
    ReportOut,
    SentPageOut,
    WorkAction,
    WorkCreateMeta,
    WorkOut,
)
from app.works.service import describe_work, owned_work
from app.works.uploads import create_work

router = APIRouter(tags=["works"])
MULTIPART_OVERHEAD = 1024 * 1024


def parse_meta(raw: object) -> WorkCreateMeta:
    if not isinstance(raw, str):
        raise DomainError("work_meta_invalid")
    try:
        return WorkCreateMeta.model_validate(json.loads(raw))
    except (ValueError, ValidationError) as error:
        raise DomainError("work_meta_invalid") from error


@router.post("/works", response_model_exclude_none=True)
async def post_work(
    request: Request,
    current: WritableAccountDep,
    session: SessionDep,
    settings: SettingsDep,
    storage: StorageDep,
) -> WorkOut:
    limit = settings.max_files_per_work * settings.max_file_bytes + MULTIPART_OVERHEAD
    if int(request.headers.get("content-length") or 0) > limit:
        raise DomainError("request_too_large")
    async with request.form(max_files=settings.max_files_per_work, max_fields=1) as form:
        meta = parse_meta(form.get("meta"))
        uploads = {key: value for key, value in form.items() if key != "meta"}
        if any(isinstance(value, str) for value in uploads.values()):
            raise DomainError("attachments_mismatch")
        work = await create_work(session, storage, settings, current.user.id, meta, uploads)
    return await describe_work(session, work)


@router.get("/works/{work_id}", response_model_exclude_none=True)
async def get_work(work_id: UUID, current: CurrentAccountDep, session: SessionDep) -> WorkOut:
    return await describe_work(session, await owned_work(session, current.user.id, work_id))


@router.delete("/works/{work_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_work(
    work_id: UUID, current: CurrentAccountDep, session: SessionDep, settings: SettingsDep
) -> None:
    await delete_work(session, settings, current.user.id, work_id)


@router.delete("/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_student(
    student_id: UUID, current: CurrentAccountDep, session: SessionDep, settings: SettingsDep
) -> None:
    await delete_student(session, settings, current.user.id, student_id)


@router.put("/works/{work_id}/draft")
async def put_draft(
    work_id: UUID,
    data: DraftSaveIn,
    current: WritableAccountDep,
    session: SessionDep,
    settings: SettingsDep,
) -> DraftSavedOut:
    draft = await save_draft(
        session, settings, current.user.id, work_id, data.base_revision, data.draft
    )
    return DraftSavedOut(revision=draft.revision, input_revision=draft.input_revision)


@router.put("/works/{work_id}/attachments", response_model_exclude_none=True)
async def put_attachments(
    work_id: UUID,
    layout: list[AttachmentLayout],
    current: WritableAccountDep,
    session: SessionDep,
) -> WorkOut:
    work = await update_attachments(session, current.user.id, work_id, layout)
    return await describe_work(session, work)


@router.post("/works/{work_id}/actions/{action}", response_model_exclude_none=True)
async def post_action(
    work_id: UUID,
    action: WorkAction,
    current: WritableAccountDep,
    session: SessionDep,
    settings: SettingsDep,
) -> WorkOut:
    work = await run_action(session, settings, current.user.id, work_id, action)
    return await describe_work(session, work)


@router.get("/works/{work_id}/report", response_model_exclude_none=True)
async def get_report(
    work_id: UUID,
    current: CurrentAccountDep,
    session: SessionDep,
    revision_id: Annotated[UUID | None, Query(alias="revisionId")] = None,
) -> ReportOut:
    return await read_report(session, current.user.id, work_id, revision_id)


@router.get("/works/{work_id}/analysis/pages")
async def get_sent_pages(
    work_id: UUID, current: CurrentAccountDep, session: SessionDep
) -> list[SentPageOut]:
    pages = await sent_pages(session, current.user.id, work_id)
    return [
        SentPageOut.model_validate({key: value for key, value in page.items() if key != "key"})
        for page in pages
    ]


@router.get("/works/{work_id}/analysis/pages/{index}")
async def get_sent_page(
    work_id: UUID, index: int, current: CurrentAccountDep, session: SessionDep, storage: StorageDep
) -> StreamingResponse:
    page = await sent_page(session, current.user.id, work_id, index)
    try:
        chunks = await storage.open(page["key"])
    except StorageError as error:
        raise DomainError(error.code) from error
    headers = {"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600"}
    return StreamingResponse(chunks, media_type=page["contentType"], headers=headers)


@router.get("/files/{file_id}", status_code=status.HTTP_200_OK)
async def get_file(
    file_id: UUID, current: CurrentAccountDep, session: SessionDep, storage: StorageDep
) -> StreamingResponse:
    file = await owned_file(session, current.user.id, file_id)
    try:
        chunks = await storage.open(file.storage_key)
    except StorageError as error:
        raise DomainError(error.code) from error
    headers = {
        "Content-Disposition": f"inline; filename*=UTF-8''{quote(file.name)}",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
    }
    return StreamingResponse(chunks, media_type=file.content_type, headers=headers)
