from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, status

from app.dependencies import ProviderDep, SessionDep, SettingsDep
from app.errors import DomainError
from app.provider import ProviderError
from app.queue import Job
from app.stand.intake import STAND_JOB, accept_work, process_now
from app.stand.schemas import ErrorOut, JobOut, ResultOut, WorkCreate

router = APIRouter(tags=["stand"])

UploadKey = Annotated[str, Header(min_length=1, max_length=64)]
PROVIDER_ERRORS: dict[int | str, dict] = {
    status.HTTP_502_BAD_GATEWAY: {"model": ErrorOut},
    status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ErrorOut},
    status.HTTP_504_GATEWAY_TIMEOUT: {"model": ErrorOut},
}


@router.post("/works", status_code=status.HTTP_202_ACCEPTED)
async def create_work(
    data: WorkCreate, session: SessionDep, settings: SettingsDep, idempotency_key: UploadKey
) -> JobOut:
    job = await accept_work(session, data, idempotency_key, settings.job_attempts)
    return JobOut.model_validate(job)


@router.post("/sync/works", responses=PROVIDER_ERRORS)
async def create_work_sync(
    data: WorkCreate,
    session: SessionDep,
    provider: ProviderDep,
    settings: SettingsDep,
    x_upload_id: UploadKey,
) -> ResultOut:
    try:
        result = await process_now(session, provider, settings, data, x_upload_id)
    except ProviderError as error:
        raise DomainError(error.code) from error
    return ResultOut.model_validate(result)


@router.get("/jobs/{job_id}", responses={status.HTTP_404_NOT_FOUND: {"model": ErrorOut}})
async def read_job(job_id: UUID, session: SessionDep) -> JobOut:
    job = await session.get(Job, job_id)
    if job is None or job.kind != STAND_JOB:
        raise DomainError("job_not_found")
    return JobOut.model_validate(job)
