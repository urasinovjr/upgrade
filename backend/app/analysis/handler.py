import logging
import time
from dataclasses import asdict
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.contract import InvalidReply
from app.analysis.drafting import layout_signature
from app.analysis.pipeline import AnalysisSource, RunRecord, build_draft, elapsed_ms
from app.analysis.service import accept_draft, mark_failed
from app.files.storage import Storage, StorageError
from app.observability import current_request_id
from app.provider import ProviderError
from app.queue import Job, JobFailure, WorkerContext, complete_job
from app.redaction import PageUnreadable, SourceFile, sanitize_pages
from app.students.models import Student
from app.works.models import AnalysisRun, Work, WorkFile
from app.works.schemas import Draft
from app.works.service import files_of, read_draft

logger = logging.getLogger("analysis")

INVALID_REPLY = "provider_invalid_response"
FINAL_PROVIDER_ERRORS = {"provider_auth", "provider_rejected"}


async def current_work(session, job: Job) -> Work | None:
    work = await session.get(Work, job.subject_id, with_for_update=True)
    if work is None or work.analysis_job_id != job.id:
        return None
    return work


async def last_layout(session: AsyncSession, work_id: UUID) -> list[dict] | None:
    run_input = await session.scalar(
        select(AnalysisRun.input)
        .where(AnalysisRun.work_id == work_id, AnalysisRun.status == "succeeded")
        .order_by(AnalysisRun.created_at.desc())
        .limit(1)
    )
    return run_input["layout"] if run_input else None


async def read_file(storage: Storage, file: WorkFile) -> SourceFile:
    chunks = [chunk async for chunk in await storage.open(file.storage_key)]
    return SourceFile(
        file_id=str(file.id),
        content_type=file.content_type,
        data=b"".join(chunks),
        page_order=file.page_order,
        crops=file.crops,
        masks=file.masks,
    )


async def begin_analysis(context: WorkerContext, job: Job) -> AnalysisSource | None:
    async with context.sessions() as session:
        work = await current_work(session, job)
        if work is None:
            await complete_job(session, job.id)
            await session.commit()
            return None
        work.status = "processing"
        teacher_id = work.teacher_id
        student = await session.get(Student, work.student_id)
        student_name = student.name if student else ""
        files = await files_of(session, [work.id])
        draft = read_draft(work)
        previous_layout = await last_layout(session, work.id)
        await session.commit()
    started = time.monotonic()
    try:
        sources = [await read_file(context.storage, file) for file in files]
        sanitized = await sanitize_pages(
            context.storage, context.settings, teacher_id, job.subject_id, sources
        )
    except StorageError as error:
        raise JobFailure(error.code) from error
    except PageUnreadable as error:
        raise JobFailure(error.code, retryable=False) from error
    return AnalysisSource(
        input_revision=job.payload["input_revision"],
        draft=draft,
        sanitized=sanitized,
        sanitize_ms=elapsed_ms(started),
        layout=layout_signature(files),
        last_layout=previous_layout,
        student_name=student_name,
    )


def queued_ms(job: Job) -> int:
    return max(0, round((datetime.now(UTC) - job.run_after).total_seconds() * 1000))


def run_fields(run: AnalysisRun) -> dict:
    return {
        "work_id": str(run.work_id),
        "run_id": str(run.id),
        "error": run.error,
        "queued_ms": run.queued_ms,
        "recognize_ms": run.recognize_ms,
        "review_ms": run.review_ms,
        "input_tokens": run.input_tokens,
        "output_tokens": run.output_tokens,
    }


async def save_run(
    context: WorkerContext, job: Job, record: RunRecord, draft: Draft | None, error: str | None
) -> None:
    record.price(context.analysis_variant)
    async with context.sessions() as session:
        work = await session.get(Work, job.subject_id, with_for_update=True)
        if work is not None:
            run = AnalysisRun(
                work_id=work.id,
                job_id=job.id,
                input_revision=job.payload["input_revision"],
                status="failed" if error else "succeeded",
                error=error,
                **asdict(record),
            )
            session.add(run)
            await session.flush()
            if draft is not None and work.analysis_job_id == job.id:
                accept_draft(work, draft, run.id, job.payload["input_revision"])
            logger.info("analysis_run", extra=run_fields(run))
        if draft is not None:
            await complete_job(session, job.id)
        await session.commit()


async def handle_work_analysis(context: WorkerContext, job: Job) -> None:
    source = await begin_analysis(context, job)
    if source is None:
        return
    record = RunRecord(
        request_id=current_request_id(),
        queued_ms=queued_ms(job),
        variant=context.analysis_variant.name,
        code_commit=context.code_commit,
    )
    try:
        draft = await build_draft(context.analysis_provider, source, context.settings, record)
    except ProviderError as error:
        raise JobFailure(
            error.code,
            retryable=error.code not in FINAL_PROVIDER_ERRORS,
            deferred=error.code == "provider_rate_limited",
        ) from error
    except InvalidReply as error:
        logger.info(
            "analysis_invalid_reply",
            extra={"work_id": str(job.subject_id), "reason": error.reason},
        )
        await save_run(context, job, record, None, INVALID_REPLY)
        raise JobFailure(INVALID_REPLY) from error
    await save_run(context, job, record, draft, None)


async def mark_analysis_failed(context: WorkerContext, job: Job) -> None:
    async with context.sessions() as session:
        work = await current_work(session, job)
        if work is not None:
            mark_failed(work)
            await session.commit()
