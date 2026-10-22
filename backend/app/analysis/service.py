from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import DomainError
from app.queue import enqueue
from app.works.models import Work
from app.works.schemas import Draft
from app.works.service import dump, files_of, read_draft

WORK_ANALYSIS_JOB = "work_analysis"


async def start_analysis(session: AsyncSession, settings: Settings, work: Work) -> None:
    files = await files_of(session, [work.id])
    if sum(file.size for file in files) > settings.analysis_max_bytes:
        raise DomainError("analysis_too_large")
    draft = read_draft(work)
    job = await enqueue(
        session,
        WORK_ANALYSIS_JOB,
        work.id,
        settings.job_attempts,
        {"input_revision": draft.input_revision},
    )
    work.analysis_job_id = job.id
    work.status = "queued"


def accept_draft(work: Work, draft: Draft, run_id: UUID, input_revision: int) -> None:
    work.analysis_job_id = None
    if input_revision != read_draft(work).input_revision:
        work.status = "needs_input"
        return
    work.draft = dump(draft)
    work.analysis_run_id = run_id
    work.manual = False
    work.status = "ready"


def mark_failed(work: Work) -> None:
    work.analysis_job_id = None
    work.status = "failed"
