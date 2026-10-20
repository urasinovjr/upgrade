from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.queue import enqueue
from app.works.models import Work
from app.works.service import dump, files_of, read_draft

WORK_ANALYSIS_JOB = "work_analysis"


async def start_analysis(session: AsyncSession, settings: Settings, work: Work) -> None:
    draft = read_draft(work)
    pages = sum(len(file.page_order) for file in await files_of(session, [work.id]))
    job = await enqueue(
        session,
        WORK_ANALYSIS_JOB,
        work.id,
        settings.job_attempts,
        {"input_revision": draft.input_revision, "pages": pages},
    )
    work.analysis_job_id = job.id
    work.status = "queued"


def apply_outcome(work: Work, input_revision: int, succeeded: bool) -> None:
    work.analysis_job_id = None
    draft = read_draft(work)
    if not succeeded:
        work.status = "failed"
    elif input_revision != draft.input_revision:
        work.status = "needs_input"
    else:
        work.status = "ready"
        draft.analysed_input_revision = input_revision
        work.draft = dump(draft)
