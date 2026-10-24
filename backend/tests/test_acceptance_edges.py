import asyncio
from uuid import UUID

import pytest
from sqlalchemy import func, select

from app.analysis.contract import ReviewTask
from app.analysis.service import WORK_ANALYSIS_JOB
from app.queue import Job
from app.works.models import WorkRevision
from tests.fakes import FakeDraftProvider
from tests.students import create_student
from tests.test_analysis import read_work, retry_now, run_next_job, stored_runs
from tests.works import (
    act,
    check_all_pages,
    checked_work,
    confirmed_work,
    create_work,
    finish_review,
    finished_task,
    save,
    task,
)


class OneOutOfScope(FakeDraftProvider):
    async def review(self, tasks: list[ReviewTask], conditions=None):
        reply = await super().review(tasks, conditions)
        reply.raw["tasks"][1] = {
            "task_id": tasks[1].id,
            "supported": False,
            "reason": "Производная вне охвата пилота.",
            "topic_id": "equations",
            "steps": [],
        }
        return reply


def refusing_provider() -> FakeDraftProvider:
    return FakeDraftProvider(failures=1, error="provider_rejected")


async def revision_count(sessions, work_id: str) -> int:
    async with sessions() as session:
        return await session.scalar(
            select(func.count())
            .select_from(WorkRevision)
            .where(WorkRevision.work_id == UUID(work_id))
        )


async def analysis_jobs(sessions, work_id: str) -> list[Job]:
    async with sessions() as session:
        rows = await session.scalars(
            select(Job)
            .where(Job.kind == WORK_ANALYSIS_JOB, Job.subject_id == UUID(work_id))
            .order_by(Job.created_at)
        )
        return list(rows)


async def edited_confirmed_work(teacher) -> tuple[dict, dict]:
    confirmed = await confirmed_work(teacher, await create_student(teacher))
    edited = (await act(teacher, confirmed["id"], "edit")).json()
    edited = await check_all_pages(teacher, edited)
    changed = {**edited["draft"], "tasks": [finished_task()], "feedback": "Правка второй редакции"}
    saved = await save(teacher, edited, changed)
    assert saved.status_code == 200, saved.text
    return confirmed, (await teacher.get(f"/api/works/{confirmed['id']}")).json()


@pytest.mark.prd(8)
async def test_repeated_and_parallel_confirmation_store_one_revision(teacher, sessions):
    work = await create_work(teacher, await create_student(teacher))
    await finish_review(teacher, work)
    assert (await act(teacher, work["id"], "manual")).status_code == 200

    responses = await asyncio.gather(*[act(teacher, work["id"], "confirm") for _ in range(3)])
    again = await act(teacher, work["id"], "confirm")

    assert [response.status_code for response in [*responses, again]] == [200] * 4
    assert await revision_count(sessions, work["id"]) == 1
    assert [item["number"] for item in again.json()["published"]] == [1]


@pytest.mark.prd(7)
async def test_failed_analysis_keeps_edits_and_the_published_revision(
    teacher, sessions, test_settings, storage
):
    confirmed, edited = await edited_confirmed_work(teacher)
    assert (await act(teacher, confirmed["id"], "analyse")).status_code == 200

    await run_next_job(sessions, test_settings, storage, refusing_provider())
    failed = await read_work(teacher, confirmed["id"])
    report = await teacher.get(f"/api/works/{confirmed['id']}/report")

    assert failed["status"] == "failed"
    assert failed["draft"]["feedback"] == "Правка второй редакции"
    assert failed["draft"]["tasks"] == edited["draft"]["tasks"]
    assert failed["attachments"] == edited["attachments"]
    assert failed["currentPublishedId"] == confirmed["currentPublishedId"]
    assert [item["number"] for item in failed["published"]] == [1]
    assert report.json()["revision"]["number"] == 1
    assert await stored_runs(sessions, confirmed["id"]) == []


@pytest.mark.prd(7)
async def test_retry_after_failure_queues_one_new_job(teacher, sessions, test_settings, storage):
    work = await checked_work(teacher, await create_student(teacher))
    await act(teacher, work["id"], "analyse")
    await run_next_job(sessions, test_settings, storage, refusing_provider())

    retried = await act(teacher, work["id"], "analyse")
    repeated = await act(teacher, work["id"], "analyse")
    jobs = await analysis_jobs(sessions, work["id"])
    await retry_now(sessions, jobs[-1])
    await run_next_job(sessions, test_settings, storage, FakeDraftProvider())

    assert retried.status_code == 200
    assert repeated.json() == {"detail": "analysis_in_progress"}
    assert [job.status for job in await analysis_jobs(sessions, work["id"])] == ["failed", "done"]
    assert len(await stored_runs(sessions, work["id"])) == 1
    assert (await read_work(teacher, work["id"]))["status"] == "ready"


@pytest.mark.prd(9, 10, 13)
async def test_report_follows_the_latest_revision_and_history_survives_withdrawal(teacher):
    confirmed, _ = await edited_confirmed_work(teacher)
    work_id = confirmed["id"]
    second = (await act(teacher, work_id, "confirm")).json()
    latest = await teacher.get(f"/api/works/{work_id}/report")
    withdrawn = (await act(teacher, work_id, "withdraw")).json()
    revisions = {item["number"]: item["id"] for item in withdrawn["published"]}
    old = await teacher.get(f"/api/works/{work_id}/report", params={"revisionId": revisions[2]})

    assert [item["number"] for item in second["published"]] == [1, 2]
    assert latest.json()["revision"]["number"] == 2
    assert latest.json()["revision"]["draft"]["feedback"] == "Правка второй редакции"
    assert sorted(revisions) == [1, 2]
    assert old.status_code == 200
    assert old.json()["revision"]["number"] == 2
    assert (await teacher.get(f"/api/works/{work_id}/report")).status_code == 404


@pytest.mark.prd(4)
async def test_confirmation_with_unclear_steps_is_blocked(teacher, sessions):
    work = await create_work(teacher, await create_student(teacher))

    response = await act(teacher, work["id"], "confirm")

    assert response.status_code == 409
    assert response.json()["detail"] == "review_blocked"
    assert "Задача 1: уточните неясные шаги." in response.json()["blockers"]
    assert await revision_count(sessions, work["id"]) == 0


@pytest.mark.prd(5)
async def test_unsupported_task_is_marked_and_the_rest_is_confirmed(
    teacher, sessions, test_settings, storage
):
    tasks = [task("t1"), task("t2", title="Задача 2", condition="Найдите производную x^3")]
    work = await checked_work(teacher, await create_student(teacher), tasks=tasks)
    await act(teacher, work["id"], "analyse")

    await run_next_job(sessions, test_settings, storage, OneOutOfScope())
    analysed = await read_work(teacher, work["id"])
    supported, unsupported = analysed["draft"]["tasks"]
    reviewed = {**analysed["draft"], "tasks": [{**supported, "reviewed": True}, unsupported]}
    saved = await save(teacher, analysed, reviewed)
    confirmed = await act(teacher, work["id"], "confirm")
    report = (await teacher.get(f"/api/works/{work['id']}/report")).json()

    assert (unsupported["omitted"], unsupported["feedback"]) == (
        True,
        "Производная вне охвата пилота.",
    )
    assert supported["omitted"] is False
    assert saved.status_code == 200, saved.text
    assert confirmed.status_code == 200, confirmed.text
    assert [item["omitted"] for item in report["revision"]["draft"]["tasks"]] == [False, True]
