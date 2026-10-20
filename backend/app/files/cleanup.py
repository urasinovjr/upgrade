from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.files.storage import StorageError
from app.queue import Job, JobFailure, WorkerContext, complete_job, enqueue

DELETE_FILES_JOB = "delete_files"


async def enqueue_file_cleanup(
    session: AsyncSession, subject_id: UUID, prefixes: list[str], max_attempts: int
) -> Job:
    return await enqueue(
        session, DELETE_FILES_JOB, subject_id, max_attempts, {"prefixes": prefixes}
    )


async def handle_delete_files(context: WorkerContext, job: Job) -> None:
    try:
        for prefix in job.payload["prefixes"]:
            await context.storage.delete_prefix(prefix)
    except StorageError as error:
        raise JobFailure(error.code) from error
    async with context.sessions() as session:
        await complete_job(session, job.id)
        await session.commit()
