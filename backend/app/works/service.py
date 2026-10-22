import json
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.config import Settings
from app.errors import DomainError
from app.queue import Job
from app.works.models import AnalysisRun, Work, WorkFile, WorkRevision
from app.works.schemas import (
    AnalysisInfo,
    AttachmentOut,
    Draft,
    PublishedRevision,
    WorkJob,
    WorkOut,
)


def dump(model) -> dict:
    return model.model_dump(mode="json", by_alias=True, exclude_none=True)


def read_draft(work: Work) -> Draft:
    return Draft.model_validate(work.draft)


def draft_too_large(draft: Draft, settings: Settings) -> bool:
    return len(json.dumps(dump(draft), ensure_ascii=False).encode()) > settings.max_draft_bytes


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


async def runs_by_id(session: AsyncSession, run_ids: list[UUID]) -> dict[UUID, AnalysisRun]:
    if not run_ids:
        return {}
    rows = await session.scalars(
        select(AnalysisRun)
        .where(AnalysisRun.id.in_(run_ids))
        .options(
            load_only(
                AnalysisRun.id,
                AnalysisRun.provider,
                AnalysisRun.model,
                AnalysisRun.prompt_version,
                AnalysisRun.draft,
                AnalysisRun.created_at,
            )
        )
    )
    return {run.id: run for run in rows}


def analysis_info(run: AnalysisRun | None) -> AnalysisInfo | None:
    if run is None:
        return None
    return AnalysisInfo(
        run_id=run.id,
        provider=run.provider,
        model=run.model,
        prompt_version=run.prompt_version,
        finished_at=run.created_at,
    )


def initial_analysis(run: AnalysisRun | None) -> Draft | None:
    if run is None or run.draft is None:
        return None
    return Draft.model_validate(run.draft)


def revision_out(revision: WorkRevision, run: AnalysisRun | None = None) -> PublishedRevision:
    return PublishedRevision(
        id=revision.id,
        number=revision.number,
        confirmed_at=revision.confirmed_at,
        draft=Draft.model_validate(revision.draft),
        attachments=revision.attachments,
        analysis=analysis_info(run),
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
    work: Work,
    files: list[WorkFile],
    revisions: list[WorkRevision],
    job: Job | None = None,
    runs: dict[UUID, AnalysisRun] | None = None,
) -> WorkOut:
    runs = runs or {}
    run = runs.get(work.analysis_run_id)
    return WorkOut(
        id=work.id,
        student_id=work.student_id,
        title=work.title,
        created_at=work.created_at,
        status=work.status,
        attachments=[attachment_out(file) for file in files],
        draft=read_draft(work),
        published=[
            revision_out(revision, runs.get(revision.analysis_run_id)) for revision in revisions
        ],
        current_published_id=work.current_revision_id,
        editing=work.editing,
        manual=work.manual,
        job=job_out(job),
        initial_analysis=initial_analysis(run),
        analysis=analysis_info(run),
    )


async def describe_works(session: AsyncSession, works: list[Work]) -> list[WorkOut]:
    work_ids = [work.id for work in works]
    files = await files_of(session, work_ids)
    revisions = await revisions_of(session, work_ids)
    job_ids = [work.analysis_job_id for work in works if work.analysis_job_id]
    jobs = {job.id: job for job in await session.scalars(select(Job).where(Job.id.in_(job_ids)))}
    run_ids = [work.analysis_run_id for work in works if work.analysis_run_id]
    run_ids += [revision.analysis_run_id for revision in revisions if revision.analysis_run_id]
    runs = await runs_by_id(session, run_ids)
    return [
        work_out(
            work,
            [file for file in files if file.work_id == work.id],
            [revision for revision in revisions if revision.work_id == work.id],
            jobs.get(work.analysis_job_id) if work.analysis_job_id else None,
            runs,
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
