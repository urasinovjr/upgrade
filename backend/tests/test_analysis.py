from datetime import timedelta
from uuid import UUID

import pytest
from sqlalchemy import func, select, update

from app.analysis import WORK_ANALYSIS_JOB, start_analysis
from app.errors import DomainError
from app.queue import Job, claim_job
from app.worker import fail_abandoned_jobs, handle_job
from app.works import Work
from app.works.models import AnalysisRun
from tests.conftest import worker_context
from tests.fakes import FakeDraftProvider
from tests.students import create_student
from tests.works import act, checked_work, create_work, save


async def run_next_job(sessions, settings, storage, provider=None) -> Job:
    async with sessions() as session:
        await session.execute(
            update(Job).where(Job.kind != WORK_ANALYSIS_JOB).values(status="done")
        )
        await session.commit()
        job = await claim_job(session, lease_seconds=5)
    assert job is not None
    context = worker_context(sessions, settings, storage=storage, analysis_provider=provider)
    await handle_job(context, job)
    return job


async def retry_now(sessions, job: Job) -> None:
    async with sessions() as session:
        await session.execute(update(Job).where(Job.id == job.id).values(run_after=func.now()))
        await session.commit()


async def queued_work(teacher) -> dict:
    student_id = await create_student(teacher)
    work = await checked_work(teacher, student_id)
    response = await act(teacher, work["id"], "analyse")
    assert response.status_code == 200, response.text
    return response.json()


async def read_work(teacher, work_id: str) -> dict:
    return (await teacher.get(f"/api/works/{work_id}")).json()


async def stored_runs(sessions, work_id: str) -> list[AnalysisRun]:
    async with sessions() as session:
        rows = await session.scalars(
            select(AnalysisRun)
            .where(AnalysisRun.work_id == UUID(work_id))
            .order_by(AnalysisRun.created_at)
        )
        return list(rows)


async def analysed_work(teacher, sessions, settings, storage, provider=None) -> dict:
    queued = await queued_work(teacher)
    await run_next_job(sessions, settings, storage, provider)
    return await read_work(teacher, queued["id"])


async def test_analysis_fills_the_draft_from_the_reply(teacher, sessions, test_settings, storage):
    queued = await queued_work(teacher)

    await run_next_job(sessions, test_settings, storage)
    ready = await read_work(teacher, queued["id"])
    task = ready["draft"]["tasks"][0]

    assert queued["status"] == "queued"
    assert queued["job"]["inputRevision"] == 0
    assert ready["status"] == "ready"
    assert ready["manual"] is False
    assert "job" not in ready
    assert ready["draft"]["analysedInputRevision"] == ready["draft"]["inputRevision"]
    assert [(step["latex"], step["verdict"]) for step in task["steps"]] == [("x=\\pm 2", "correct")]
    assert task["feedback"] == "Решение верное."
    assert task["reviewed"] is False
    assert ready["initialAnalysis"] == ready["draft"]
    assert ready["analysis"]["provider"] == "fake"
    assert ready["analysis"]["model"] == "fake-model"
    assert ready["analysis"]["promptVersion"] == "test-1"


async def test_every_run_is_stored_with_the_raw_reply(teacher, sessions, test_settings, storage):
    work = await analysed_work(teacher, sessions, test_settings, storage)

    [run] = await stored_runs(sessions, work["id"])

    assert run.status == "succeeded"
    assert run.recognized is True
    assert str(run.id) == work["analysis"]["runId"]
    assert run.recognition is not None and run.recognition["tasks"][0]["task_id"] == "t1"
    assert run.review is not None and run.review["tasks"][0]["supported"] is True
    assert run.input["recognize"] == ["t1"]
    assert run.input["layout"][0]["id"] == work["attachments"][0]["id"]
    assert run.draft == work["initialAnalysis"]
    assert run.recognize_ms is not None and run.review_ms is not None


async def test_reanalysis_keeps_corrected_steps(teacher, sessions, test_settings, storage):
    provider = FakeDraftProvider()
    work = await analysed_work(teacher, sessions, test_settings, storage, provider)
    task = work["draft"]["tasks"][0]
    corrected = {**task, "steps": [{**task["steps"][0], "latex": "x=2"}]}
    saved = await save(teacher, work, {**work["draft"], "tasks": [corrected]})
    assert saved.status_code == 200, saved.text

    await act(teacher, work["id"], "analyse")
    await run_next_job(sessions, test_settings, storage, provider)
    again = await read_work(teacher, work["id"])

    assert len(provider.recognized) == 1
    assert [step.latex for step in provider.reviewed[1][0].steps] == ["x=2"]
    assert again["status"] == "ready"
    assert again["draft"]["tasks"][0]["steps"][0]["latex"] == "x=2"
    assert again["initialAnalysis"]["tasks"][0]["steps"][0]["latex"] == "x=2"
    assert len(await stored_runs(sessions, work["id"])) == 2


async def test_analysed_work_can_be_confirmed(teacher, sessions, test_settings, storage):
    work = await analysed_work(teacher, sessions, test_settings, storage)
    task = {**work["draft"]["tasks"][0], "reviewed": True}
    saved = await save(teacher, work, {**work["draft"], "tasks": [task]})
    assert saved.status_code == 200, saved.text

    confirmed = await act(teacher, work["id"], "confirm")

    assert confirmed.json()["status"] == "confirmed"
    assert confirmed.json()["published"][0]["analysis"] == work["analysis"]


async def test_invalid_reply_is_stored_retried_then_failed(
    teacher, sessions, test_settings, storage
):
    settings = test_settings.model_copy(update={"job_attempts": 2})
    student_id = await create_student(teacher)
    work = await checked_work(teacher, student_id)
    async with sessions() as session:
        stored = await session.get(Work, UUID(work["id"]))
        await start_analysis(session, settings, stored)
        await session.commit()
    provider = FakeDraftProvider(invalid=5)

    first = await run_next_job(sessions, settings, storage, provider)
    await retry_now(sessions, first)
    await run_next_job(sessions, settings, storage, provider)
    failed = await read_work(teacher, work["id"])
    runs = await stored_runs(sessions, work["id"])

    assert failed["status"] == "failed"
    assert "analysis" not in failed
    assert [(run.status, run.error) for run in runs] == [
        ("failed", "provider_invalid_response")
    ] * 2
    assert runs[0].review == {"tasks": "broken"}
    assert runs[0].draft is None


async def test_provider_failure_is_retried_then_failed(teacher, sessions, test_settings, storage):
    settings = test_settings.model_copy(update={"job_attempts": 2})
    student_id = await create_student(teacher)
    work = await checked_work(teacher, student_id)
    async with sessions() as session:
        stored = await session.get(Work, UUID(work["id"]))
        await start_analysis(session, settings, stored)
        await session.commit()
    provider = FakeDraftProvider(failures=5)

    first = await run_next_job(sessions, settings, storage, provider)
    processing = await read_work(teacher, work["id"])
    await retry_now(sessions, first)
    await run_next_job(sessions, settings, storage, provider)
    failed = await read_work(teacher, work["id"])

    assert processing["status"] == "processing"
    assert failed["status"] == "failed"
    assert "job" not in failed
    assert await stored_runs(sessions, work["id"]) == []
    assert (await act(teacher, work["id"], "manual")).json()["status"] == "ready"


async def test_missing_file_fails_the_attempt(teacher, sessions, test_settings, storage):
    queued = await queued_work(teacher)
    storage.objects.clear()

    job = await run_next_job(sessions, test_settings, storage)

    async with sessions() as session:
        stored_job = await session.get(Job, job.id)
    assert stored_job.last_error == "file_not_found"
    assert (await read_work(teacher, queued["id"]))["status"] == "processing"


async def test_too_large_work_is_not_queued(teacher, sessions, test_settings):
    settings = test_settings.model_copy(update={"analysis_max_bytes": 1})
    student_id = await create_student(teacher)
    work = await create_work(teacher, student_id)

    async with sessions() as session:
        stored = await session.get(Work, UUID(work["id"]))
        with pytest.raises(DomainError, match="analysis_too_large"):
            await start_analysis(session, settings, stored)


async def test_work_is_locked_while_analysed(teacher):
    queued = await queued_work(teacher)

    again = await act(teacher, queued["id"], "analyse")
    edit = await save(teacher, queued, queued["draft"])
    confirm = await act(teacher, queued["id"], "confirm")

    assert again.json() == {"detail": "analysis_in_progress"}
    assert edit.json() == {"detail": "analysis_in_progress"}
    assert confirm.json()["blockers"] == ["Обработка ещё не завершена."]


async def test_changed_inputs_need_new_analysis(teacher, sessions, test_settings, storage):
    queued = await queued_work(teacher)
    async with sessions() as session:
        stored = await session.get(Work, UUID(queued["id"]))
        stored.draft = {**stored.draft, "inputRevision": 5}
        await session.commit()

    await run_next_job(sessions, test_settings, storage)
    work = await read_work(teacher, queued["id"])

    assert work["status"] == "needs_input"
    assert "analysis" not in work


async def test_superseded_job_changes_nothing(teacher, sessions, test_settings, storage):
    queued = await queued_work(teacher)
    async with sessions() as session:
        await session.execute(
            update(Work).where(Work.id == UUID(queued["id"])).values(analysis_job_id=None)
        )
        await session.commit()

    job = await run_next_job(sessions, test_settings, storage)

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


async def test_deleted_work_takes_its_runs(teacher, sessions, test_settings, storage):
    work = await analysed_work(teacher, sessions, test_settings, storage)

    response = await teacher.delete(f"/api/works/{work['id']}")

    assert response.status_code == 204
    assert await stored_runs(sessions, work["id"]) == []
