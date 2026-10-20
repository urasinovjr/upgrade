from datetime import timedelta
from uuid import UUID

from sqlalchemy import func, update

from app.analysis import WORK_ANALYSIS_JOB, start_analysis
from app.queue import Job, claim_job
from app.worker import fail_abandoned_jobs, handle_job
from app.works import Work
from tests.conftest import FakeProvider, worker_context
from tests.students import create_student
from tests.works import act, create_work, finished_task, save


async def run_next_job(sessions, settings, provider=None) -> Job:
    async with sessions() as session:
        await session.execute(
            update(Job).where(Job.kind != WORK_ANALYSIS_JOB).values(status="done")
        )
        await session.commit()
        job = await claim_job(session, lease_seconds=5)
    assert job is not None
    await handle_job(worker_context(sessions, settings, provider), job)
    return job


async def queued_work(teacher) -> dict:
    student_id = await create_student(teacher)
    work = await create_work(teacher, student_id)
    response = await act(teacher, work["id"], "analyse")
    assert response.status_code == 200, response.text
    return response.json()


async def read_work(teacher, work_id: str) -> dict:
    return (await teacher.get(f"/api/works/{work_id}")).json()


async def test_analysis_marks_work_ready(teacher, sessions, test_settings):
    queued = await queued_work(teacher)

    await run_next_job(sessions, test_settings)
    ready = await read_work(teacher, queued["id"])

    assert queued["status"] == "queued"
    assert queued["job"]["inputRevision"] == 0
    assert ready["status"] == "ready"
    assert "job" not in ready
    assert ready["draft"]["analysedInputRevision"] == ready["draft"]["inputRevision"]


async def test_work_is_locked_while_analysed(teacher):
    queued = await queued_work(teacher)

    again = await act(teacher, queued["id"], "analyse")
    edit = await save(teacher, queued, queued["draft"])
    confirm = await act(teacher, queued["id"], "confirm")

    assert again.json() == {"detail": "analysis_in_progress"}
    assert edit.json() == {"detail": "analysis_in_progress"}
    assert confirm.json()["blockers"] == ["Обработка ещё не завершена."]


async def test_analysed_work_can_be_confirmed(teacher, sessions, test_settings):
    queued = await queued_work(teacher)
    await run_next_job(sessions, test_settings)
    work = await read_work(teacher, queued["id"])
    draft = {**work["draft"], "tasks": [finished_task()]}
    first = await save(teacher, work, draft)
    await save(teacher, work, draft, base=first.json()["revision"])
    await act(teacher, work["id"], "analyse")
    await run_next_job(sessions, test_settings)

    confirmed = await act(teacher, work["id"], "confirm")

    assert confirmed.json()["status"] == "confirmed"


async def test_provider_failure_is_retried_then_failed(teacher, sessions, test_settings):
    settings = test_settings.model_copy(update={"job_attempts": 2})
    student_id = await create_student(teacher)
    work = await create_work(teacher, student_id)
    async with sessions() as session:
        stored = await session.get(Work, UUID(work["id"]))
        await start_analysis(session, settings, stored)
        await session.commit()
    provider = FakeProvider(failures=5)

    first = await run_next_job(sessions, settings, provider)
    processing = await read_work(teacher, work["id"])
    async with sessions() as session:
        await session.execute(update(Job).where(Job.id == first.id).values(run_after=func.now()))
        await session.commit()
    await run_next_job(sessions, settings, provider)
    failed = await read_work(teacher, work["id"])

    assert processing["status"] == "processing"
    assert failed["status"] == "failed"
    assert "job" not in failed
    assert (await act(teacher, work["id"], "manual")).json()["status"] == "ready"


async def test_changed_inputs_need_new_analysis(teacher, sessions, test_settings):
    queued = await queued_work(teacher)
    async with sessions() as session:
        stored = await session.get(Work, UUID(queued["id"]))
        stored.draft = {**stored.draft, "inputRevision": 5}
        await session.commit()

    await run_next_job(sessions, test_settings)

    assert (await read_work(teacher, queued["id"]))["status"] == "needs_input"


async def test_superseded_job_changes_nothing(teacher, sessions, test_settings):
    queued = await queued_work(teacher)
    async with sessions() as session:
        await session.execute(
            update(Work).where(Work.id == UUID(queued["id"])).values(analysis_job_id=None)
        )
        await session.commit()

    job = await run_next_job(sessions, test_settings)

    async with sessions() as session:
        stored_job = await session.get(Job, job.id)
    assert stored_job.status == "done"
    assert (await read_work(teacher, queued["id"]))["status"] == "queued"


async def test_abandoned_last_attempt_marks_work_failed(teacher, sessions, test_settings):
    queued = await queued_work(teacher)
    async with sessions() as session:
        await session.execute(
            update(Job).values(
                status="running",
                attempts=Job.max_attempts,
                lease_until=func.clock_timestamp() - timedelta(seconds=1),
            )
        )
        await session.commit()

    await fail_abandoned_jobs(worker_context(sessions, test_settings))

    assert (await read_work(teacher, queued["id"]))["status"] == "failed"
