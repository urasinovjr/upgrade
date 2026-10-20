import logging

from sqlalchemy.dialects.postgresql import insert

from app.provider import ProviderError
from app.queue import Job, JobFailure, WorkerContext, complete_job
from app.stand.models import StandResult, StandWork
from app.stand.processing import run_pipeline

logger = logging.getLogger("worker")


async def handle_stand_job(context: WorkerContext, job: Job) -> None:
    async with context.sessions() as session:
        work = await session.get(StandWork, job.subject_id)
    assert work is not None
    try:
        text, analysis = await run_pipeline(context.provider, work.upload_id, work.pages)
    except ProviderError as error:
        raise JobFailure(error.code) from error
    async with context.sessions() as session:
        await session.execute(
            insert(StandResult)
            .values(work_id=work.id, text=text, analysis=analysis)
            .on_conflict_do_nothing(index_elements=["work_id"])
        )
        await complete_job(session, job.id)
        await session.commit()
