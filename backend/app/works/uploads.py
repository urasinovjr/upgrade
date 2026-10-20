import asyncio
from uuid import UUID

from fastapi import UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import DomainError
from app.files import (
    PDF,
    Storage,
    StorageError,
    file_key,
    pdf_pages,
    sniff_type,
    work_prefix,
)
from app.students import owned_student
from app.works.models import Work, WorkFile
from app.works.review import initial_draft, keep_known_attachments
from app.works.schemas import WorkCreateMeta
from app.works.service import dump


async def read_upload(upload: UploadFile, settings: Settings) -> tuple[bytes, str, int]:
    data = await upload.read(settings.max_file_bytes + 1)
    if len(data) > settings.max_file_bytes:
        raise DomainError("file_too_large")
    content_type = sniff_type(data[:16])
    if content_type is None:
        raise DomainError("file_type_unsupported")
    pages = 1
    if content_type == PDF:
        counted = await asyncio.to_thread(pdf_pages, data)
        if counted is None:
            raise DomainError("file_unreadable")
        pages = counted
    return data, content_type, pages


async def store_all(storage: Storage, objects: list[tuple[str, bytes, str]]) -> None:
    for key, data, content_type in objects:
        try:
            await storage.put(key, data, content_type)
        except StorageError as error:
            raise DomainError("storage_unavailable") from error


async def forget_work_files(storage: Storage, teacher_id: UUID, work_id: UUID) -> None:
    try:
        await storage.delete_prefix(work_prefix(teacher_id, work_id))
    except StorageError:
        pass


async def existing_work(session: AsyncSession, work_id: UUID, teacher_id: UUID) -> Work | None:
    work = await session.get(Work, work_id)
    if work is not None and work.teacher_id != teacher_id:
        raise DomainError("work_exists")
    return work


async def create_work(
    session: AsyncSession,
    storage: Storage,
    settings: Settings,
    teacher_id: UUID,
    meta: WorkCreateMeta,
    uploads: dict[str, UploadFile],
) -> Work:
    found = await existing_work(session, meta.id, teacher_id)
    if found is not None:
        return found
    await owned_student(session, teacher_id, meta.student_id)
    if len(meta.attachments) > settings.max_files_per_work:
        raise DomainError("too_many_files")
    if {str(item.id) for item in meta.attachments} != set(uploads):
        raise DomainError("attachments_mismatch")
    files = []
    objects = []
    for position, attachment in enumerate(meta.attachments):
        data, content_type, pages = await read_upload(uploads[str(attachment.id)], settings)
        key = file_key(teacher_id, meta.id, attachment.id)
        objects.append((key, data, content_type))
        files.append(
            WorkFile(
                id=attachment.id,
                teacher_id=teacher_id,
                work_id=meta.id,
                position=position,
                name=attachment.name,
                content_type=content_type,
                size=len(data),
                pages=pages,
                page_order=list(range(1, pages + 1)),
                crops={},
                storage_key=key,
            )
        )
    if sum(file.pages for file in files) > settings.max_pages_per_work:
        raise DomainError("too_many_pages")
    draft = keep_known_attachments(
        initial_draft(meta.tasks), {str(item.id) for item in meta.attachments}
    )
    work = Work(
        id=meta.id,
        teacher_id=teacher_id,
        student_id=meta.student_id,
        title=meta.title,
        status="preparation",
        editing=True,
        manual=True,
        draft=dump(draft),
    )
    try:
        await store_all(storage, objects)
        session.add(work)
        await session.flush()
        session.add_all(files)
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        found = await existing_work(session, meta.id, teacher_id)
        if found is not None:
            return found
        await forget_work_files(storage, teacher_id, meta.id)
        raise DomainError("attachments_mismatch") from error
    except DomainError:
        await session.rollback()
        await forget_work_files(storage, teacher_id, meta.id)
        raise
    await session.refresh(work)
    return work
