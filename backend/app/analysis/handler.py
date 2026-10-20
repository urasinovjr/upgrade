from app.analysis.service import apply_outcome
from app.provider import ProviderError
from app.queue import Job, JobFailure, WorkerContext, complete_job
from app.works.models import Work


async def current_work(session, job: Job) -> Work | None:
    work = await session.get(Work, job.subject_id, with_for_update=True)
    if work is None or work.analysis_job_id != job.id:
        return None
    return work


async def handle_work_analysis(context: WorkerContext, job: Job) -> None:
    async with context.sessions() as session:
        work = await current_work(session, job)
        if work is None:
            await complete_job(session, job.id)
            await session.commit()
            return
        work.status = "processing"
        await session.commit()
    try:
        text = await context.provider.recognize(str(job.subject_id), job.payload["pages"])
        await context.provider.analyze(str(job.subject_id), text)
    except ProviderError as error:
        raise JobFailure(error.code) from error
    async with context.sessions() as session:
        work = await current_work(session, job)
        if work is not None:
            apply_outcome(work, job.payload["input_revision"], succeeded=True)
        await complete_job(session, job.id)
        await session.commit()


async def mark_analysis_failed(context: WorkerContext, job: Job) -> None:
    async with context.sessions() as session:
        work = await current_work(session, job)
        if work is not None:
            apply_outcome(work, job.payload["input_revision"], succeeded=False)
            await session.commit()
