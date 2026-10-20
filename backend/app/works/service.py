from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import DomainError
from app.queue import Job
from app.works.models import Work, WorkFile, WorkRevision
from app.works.schemas import AttachmentOut, Draft, PublishedRevision, WorkJob, WorkOut


def dump(model) -> dict:
    return model.model_dump(mode="json", by_alias=True, exclude_none=True)


def read_draft(work: Work) -> Draft:
    return Draft.model_validate(work.draft)


async def owned_work(
    session: AsyncSession, teacher_id: UUID, work_id: UUID, lock: bool = False
) -> Work:
    query = select(Work).where(Work.id == work_id, Work.teacher_id == teacher_id)
    if lock:
        query = query.with_for_update()
    work = await session.scalar(query)
    if work is None:
        raise DomainError("work_not_found")
    return work


async def files_of(session: AsyncSession, work_ids: list[UUID]) -> list[WorkFile]:
    rows = await session.scalars(
        select(WorkFile).where(WorkFile.work_id.in_(work_ids)).order_by(WorkFile.position)
    )
    return list(rows)


async def revisions_of(session: AsyncSession, work_ids: list[UUID]) -> list[WorkRevision]:
    rows = await session.scalars(
        select(WorkRevision).where(WorkRevision.work_id.in_(work_ids)).order_by(WorkRevision.number)
    )
    return list(rows)


def attachment_out(file: WorkFile) -> AttachmentOut:
    return AttachmentOut(
        id=file.id,
        name=file.name,
        type=file.content_type,
        size=file.size,
        pages=file.pages,
        page_order=file.page_order,
        crops=file.crops,
    )


def revision_out(revision: WorkRevision) -> PublishedRevision:
    return PublishedRevision(
        id=revision.id,
        number=revision.number,
        confirmed_at=revision.confirmed_at,
        draft=Draft.model_validate(revision.draft),
        attachments=revision.attachments,
    )


def job_out(job: Job | None) -> WorkJob | None:
    if job is None:
        return None
    started_at = int(job.created_at.timestamp() * 1000)
    return WorkJob(
        token=str(job.id),
        input_revision=job.payload["input_revision"],
        started_at=started_at,
        completes_at=started_at,
        outcome="ready",
    )


def work_out(
    work: Work, files: list[WorkFile], revisions: list[WorkRevision], job: Job | None = None
) -> WorkOut:
    return WorkOut(
        id=work.id,
        student_id=work.student_id,
        title=work.title,
        created_at=work.created_at,
        status=work.status,
        attachments=[attachment_out(file) for file in files],
        draft=read_draft(work),
        published=[revision_out(revision) for revision in revisions],
        current_published_id=work.current_revision_id,
        editing=work.editing,
        manual=work.manual,
        job=job_out(job),
    )


async def describe_works(session: AsyncSession, works: list[Work]) -> list[WorkOut]:
    work_ids = [work.id for work in works]
    files = await files_of(session, work_ids)
    revisions = await revisions_of(session, work_ids)
    job_ids = [work.analysis_job_id for work in works if work.analysis_job_id]
    jobs = {job.id: job for job in await session.scalars(select(Job).where(Job.id.in_(job_ids)))}
    return [
        work_out(
            work,
            [file for file in files if file.work_id == work.id],
            [revision for revision in revisions if revision.work_id == work.id],
            jobs.get(work.analysis_job_id) if work.analysis_job_id else None,
        )
        for work in works
    ]


async def describe_work(session: AsyncSession, work: Work) -> WorkOut:
    return (await describe_works(session, [work]))[0]


async def list_works(session: AsyncSession, teacher_id: UUID) -> list[WorkOut]:
    works = await session.scalars(
        select(Work).where(Work.teacher_id == teacher_id).order_by(Work.created_at.desc())
    )
    return await describe_works(session, list(works))
