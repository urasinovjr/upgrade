from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis import start_analysis
from app.config import Settings
from app.errors import DomainError
from app.students import StudentOut, owned_student
from app.works.models import AnalysisRun, Work, WorkFile, WorkRevision
from app.works.page_checks import kept_checks, stored_crops, stored_masks, valid_masks
from app.works.review import apply_draft, keep_known_attachments, reopened_draft, review_blockers
from app.works.schemas import AttachmentLayout, Draft, ReportOut
from app.works.service import (
    attachment_out,
    describe_work,
    draft_too_large,
    dump,
    files_of,
    owned_work,
    read_draft,
    revision_out,
    runs_by_id,
)


def require_editable(work: Work) -> None:
    if work.analysis_job_id is not None:
        raise DomainError("analysis_in_progress")
    if not work.editing:
        raise DomainError("editing_closed")


def check_draft_size(draft: Draft, settings: Settings) -> None:
    if draft_too_large(draft, settings):
        raise DomainError("draft_too_large")


async def file_ids(session: AsyncSession, work_id: UUID) -> set[str]:
    return {str(file.id) for file in await files_of(session, [work_id])}


async def save_draft(
    session: AsyncSession,
    settings: Settings,
    teacher_id: UUID,
    work_id: UUID,
    base_revision: int,
    proposed: Draft,
) -> Draft:
    work = await owned_work(session, teacher_id, work_id, lock=True)
    require_editable(work)
    stored = read_draft(work)
    if stored.revision != base_revision:
        raise DomainError("draft_conflict", {"revision": stored.revision})
    draft = apply_draft(stored, proposed)
    keep_known_attachments(draft, await file_ids(session, work_id))
    check_draft_size(draft, settings)
    work.draft = dump(draft)
    await session.commit()
    return draft


def valid_page_order(page_order: list[int], pages: int) -> bool:
    return len(set(page_order)) == len(page_order) and all(
        1 <= page <= pages for page in page_order
    )


async def update_attachments(
    session: AsyncSession, teacher_id: UUID, work_id: UUID, layout: list[AttachmentLayout]
) -> Work:
    work = await owned_work(session, teacher_id, work_id, lock=True)
    require_editable(work)
    files = {file.id: file for file in await files_of(session, [work_id])}
    if {item.id for item in layout} != set(files) or len(layout) != len(files):
        raise DomainError("attachments_mismatch")
    changed = False
    for position, item in enumerate(layout):
        file = files[item.id]
        if not valid_page_order(item.page_order, file.pages) or not valid_masks(item, file.pages):
            raise DomainError("attachments_mismatch")
        crops = stored_crops(item)
        masks = stored_masks(item)
        before = (file.position, file.page_order, file.crops, file.masks)
        changed = changed or before != (position, item.page_order, crops, masks)
        file.checked_pages = kept_checks(file, crops, masks, item.checked_pages)
        file.position = position
        file.page_order = item.page_order
        file.crops = crops
        file.masks = masks
    if changed:
        mark_inputs_changed(work)
    await session.commit()
    return work


def mark_inputs_changed(work: Work) -> None:
    draft = read_draft(work)
    draft.revision += 1
    draft.input_revision += 1
    for task in draft.tasks:
        task.reviewed = False
    work.draft = dump(draft)


async def sent_pages(session: AsyncSession, teacher_id: UUID, work_id: UUID) -> list[dict]:
    work = await owned_work(session, teacher_id, work_id)
    if work.analysis_run_id is None:
        return []
    run = await session.get(AnalysisRun, work.analysis_run_id)
    return run.sent_pages if run is not None else []


async def sent_page(session: AsyncSession, teacher_id: UUID, work_id: UUID, index: int) -> dict:
    pages = await sent_pages(session, teacher_id, work_id)
    if not 0 <= index < len(pages):
        raise DomainError("file_not_found")
    return pages[index]


async def confirm(session: AsyncSession, work: Work) -> None:
    if not work.editing and work.current_revision_id is not None:
        return
    files = await files_of(session, [work.id])
    draft = read_draft(work)
    blockers = review_blockers(
        work.status,
        work.editing,
        work.analysis_job_id is not None,
        draft,
        {str(file.id) for file in files},
    )
    if blockers:
        raise DomainError("review_blocked", {"blockers": blockers})
    count = await session.scalar(
        select(func.count()).select_from(WorkRevision).where(WorkRevision.work_id == work.id)
    )
    revision = WorkRevision(
        work_id=work.id,
        number=(count or 0) + 1,
        confirmed_at=datetime.now(UTC),
        draft=work.draft,
        attachments=[dump(attachment_out(file)) for file in files],
        analysis_run_id=work.analysis_run_id,
    )
    session.add(revision)
    await session.flush()
    work.status = "confirmed"
    work.editing = False
    work.current_revision_id = revision.id


async def begin_revision(session: AsyncSession, work: Work) -> None:
    if work.current_revision_id is None:
        work.editing = True
        return
    if work.editing:
        return
    published = await session.get(WorkRevision, work.current_revision_id)
    assert published is not None
    draft = reopened_draft(read_draft(work), Draft.model_validate(published.draft))
    work.draft = dump(draft)
    work.editing = True
    work.status = "ready"


def mark_manual(work: Work) -> None:
    require_editable(work)
    draft = read_draft(work)
    draft.analysed_input_revision = draft.input_revision
    work.draft = dump(draft)
    work.manual = True
    work.status = "ready"


async def run_action(
    session: AsyncSession, settings: Settings, teacher_id: UUID, work_id: UUID, action: str
) -> Work:
    work = await owned_work(session, teacher_id, work_id, lock=True)
    if action == "confirm":
        await confirm(session, work)
    elif action == "edit":
        await begin_revision(session, work)
    elif action == "withdraw":
        work.current_revision_id = None
        work.editing = True
        work.status = "ready"
    elif action == "manual":
        mark_manual(work)
    else:
        require_editable(work)
        await start_analysis(session, settings, work)
    await session.commit()
    return work


async def read_report(
    session: AsyncSession, teacher_id: UUID, work_id: UUID, revision_id: UUID | None
) -> ReportOut:
    work = await owned_work(session, teacher_id, work_id)
    wanted = revision_id or work.current_revision_id
    revision = await session.scalar(
        select(WorkRevision).where(WorkRevision.id == wanted, WorkRevision.work_id == work.id)
    )
    if revision is None:
        raise DomainError("revision_not_found")
    student = await owned_student(session, teacher_id, work.student_id)
    runs = await runs_by_id(session, [revision.analysis_run_id] if revision.analysis_run_id else [])
    return ReportOut(
        work=await describe_work(session, work),
        student=StudentOut.model_validate(student),
        revision=revision_out(revision, runs.get(revision.analysis_run_id)),
    )


async def owned_file(session: AsyncSession, teacher_id: UUID, file_id: UUID) -> WorkFile:
    file = await session.scalar(
        select(WorkFile).where(WorkFile.id == file_id, WorkFile.teacher_id == teacher_id)
    )
    if file is None:
        raise DomainError("file_not_found")
    return file
