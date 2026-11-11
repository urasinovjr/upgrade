from uuid import UUID

import pytest
from sqlalchemy import func, update

from app.analysis.contract import ProviderReply
from app.analysis.sim_provider import SimDraftProvider
from app.homework.models import HomeworkJob
from app.provider import ProviderError
from app.queue import claim_job
from app.queue.models import Job
from app.worker import handle_job
from tests.conftest import worker_context
from tests.homework import assign, create_homework, learner, publish_submission, send_submission
from tests.samples import picture
from tests.students import create_student


class HomeworkProvider(SimDraftProvider):
    def __init__(self):
        self.calls = 0

    async def recognize_conditions(self, text, pages):
        self.calls += 1
        return ProviderReply(
            raw={
                "tasks": [
                    {
                        "title": "Треугольник",
                        "condition": "Докажите равенство углов.",
                        "formula": "AB=AC",
                        "topic_id": "triangles",
                        "task_type_id": "geometry_proof",
                        "file_ids": [page.file_id for page in pages],
                        "exam": None,
                    }
                ]
            },
            provider="test",
            model="test",
            prompt_version="homework-1",
        )


async def run_job(sessions, settings, storage, provider):
    async with sessions() as session:
        job = await claim_job(session, settings.lease_seconds, skip_kinds=("send_email",))
    assert job is not None
    await handle_job(
        worker_context(sessions, settings, storage=storage, analysis_provider=provider), job
    )


async def upload_condition(teacher, homework, data=None):
    response = await teacher.post(
        f"/api/homework/{homework['id']}/files",
        files={"file": ("condition.png", data or picture("PNG"), "image/png")},
    )
    assert response.status_code == 200, response.text
    return response.json()


async def checked_condition(teacher, homework):
    file = homework["files"][0]
    response = await teacher.put(
        f"/api/homework/{homework['id']}/files/{file['id']}",
        json={
            "id": file["id"],
            "pageOrder": [1],
            "crops": {},
            "masks": {},
            "checkedPages": [1],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


async def recognize(teacher, homework):
    return await teacher.post(
        f"/api/homework/{homework['id']}/recognize",
        json={
            "text": "",
            "fileIds": [homework["files"][0]["id"]],
            "baseRevision": homework["revision"],
        },
    )


async def test_recognition_requires_checks_retains_source_and_never_overwrites(
    teacher, sessions, test_settings, storage
):
    homework = await upload_condition(teacher, await create_homework(teacher))
    blocked = await recognize(teacher, homework)
    assert blocked.status_code == 409
    homework = await checked_condition(teacher, homework)
    queued = await recognize(teacher, homework)
    assert queued.status_code == 200, queued.text
    provider = HomeworkProvider()
    await run_job(sessions, test_settings, storage, provider)
    result = (await teacher.get(f"/api/homework-jobs/{queued.json()['id']}")).json()
    assert result["status"] == "ready"
    assert result["result"]["tasks"][0]["confirmed"] is False
    assert result["result"]["tasks"][0]["conditionFileIds"] == [homework["files"][0]["id"]]
    assert result["provenance"]["sentPages"][0]["sha256"]
    assert (await teacher.get(f"/api/homework/{homework['id']}")).json()["tasks"] == homework[
        "tasks"
    ]
    assert (
        await teacher.get(f"/api/homework-files/{homework['files'][0]['id']}")
    ).content == picture("PNG")


async def test_late_recognition_response_and_unreadable_pages(
    teacher, sessions, test_settings, storage
):
    homework = await checked_condition(
        teacher, await upload_condition(teacher, await create_homework(teacher))
    )
    job = (await recognize(teacher, homework)).json()
    await teacher.put(
        f"/api/homework/{homework['id']}",
        json={
            "title": "Исправленное ДЗ",
            "tasks": homework["tasks"],
            "baseRevision": homework["revision"],
        },
    )
    provider = HomeworkProvider()
    await run_job(sessions, test_settings, storage, provider)
    assert provider.calls == 0
    assert (await teacher.get(f"/api/homework-jobs/{job['id']}")).json()["status"] == "stale"
    broken = await checked_condition(
        teacher,
        await upload_condition(
            teacher, await create_homework(teacher), b"\x89PNG\r\n\x1a\ninvalid"
        ),
    )
    job = (await recognize(teacher, broken)).json()
    await run_job(sessions, test_settings, storage, provider)
    assert (await teacher.get(f"/api/homework-jobs/{job['id']}")).json()["status"] == "needs_input"
    assert (await teacher.get(f"/api/homework-files/{broken['files'][0]['id']}")).status_code == 200


async def test_condition_copies_survive_and_student_cannot_read_other_original(
    teacher, other_teacher, sessions, test_settings, storage
):
    student = await create_student(teacher)
    homework = await checked_condition(
        teacher, await upload_condition(teacher, await create_homework(teacher))
    )
    task = {**homework["tasks"][0], "conditionFileIds": [homework["files"][0]["id"]]}
    response = await teacher.put(
        f"/api/homework/{homework['id']}",
        json={"title": homework["title"], "tasks": [task], "baseRevision": homework["revision"]},
    )
    homework = await assign(teacher, response.json(), [student])
    copied = (await teacher.post(f"/api/homework/{homework['id']}/copy")).json()
    assert copied["files"][0]["id"] != homework["files"][0]["id"]
    assert (
        await teacher.get(f"/api/homework-files/{copied['files'][0]['id']}")
    ).content == picture("PNG")
    async with learner(teacher, student, test_settings, storage) as (client, _, _):
        assert (
            await client.get(f"/api/student/files/{homework['files'][0]['id']}")
        ).status_code == 200
        assert (
            await client.get(f"/api/student/files/{copied['files'][0]['id']}")
        ).status_code == 404
        sent = await send_submission(
            client, homework["assignments"][0]["id"], homework["tasks"], student=True
        )
        work = (await teacher.get(f"/api/works/{sent.json()['id']}")).json()
        assert len(work["attachments"]) == 3
        assert work["draft"]["tasks"][0]["conditionAttachmentIds"][0] != homework["files"][0]["id"]
        assert (
            await other_teacher.get(f"/api/homework-files/{homework['files'][0]['id']}")
        ).status_code == 404


async def test_materials_require_published_gap_and_stay_teacher_only(
    teacher, other_teacher, sessions, test_settings, storage
):
    student = await create_student(teacher)
    homework = await assign(teacher, await create_homework(teacher), [student])
    work = (
        await send_submission(teacher, homework["assignments"][0]["id"], homework["tasks"])
    ).json()
    data = {"workId": work["id"], "taskId": homework["tasks"][0]["id"]}
    assert (await teacher.post("/api/materials", json=data)).status_code == 409
    await publish_submission(teacher, work, "confirmed")
    material = await teacher.post("/api/materials", json=data)
    assert material.status_code == 200, material.text
    await run_job(sessions, test_settings, storage, HomeworkProvider())
    job_id = material.json()["id"]
    result = (await teacher.get(f"/api/homework-jobs/{job_id}")).json()
    assert result["status"] == "ready"
    assert len(result["result"]["exercises"]) == 3
    result["result"]["explanation"] = "Проверено репетитором."
    assert (await teacher.put(f"/api/materials/{job_id}", json=result["result"])).status_code == 200
    assert (await other_teacher.get(f"/api/homework-jobs/{job_id}")).status_code == 404
    async with learner(teacher, student, test_settings, storage) as (client, _, _):
        assert (await client.get(f"/api/homework-jobs/{job_id}")).status_code == 403
        assert "exercises" not in (await client.get("/api/student/state")).text
    async with sessions() as session:
        stored = await session.get(HomeworkJob, UUID(job_id))
        assert stored.input["revisionId"]
    assert (await teacher.get(f"/api/materials?work_id={work['id']}")).json()[0]["result"][
        "explanation"
    ] == "Проверено репетитором."


@pytest.mark.parametrize("during_processing", [False, True])
async def test_material_is_stale_if_published_source_is_withdrawn(
    teacher, sessions, test_settings, storage, during_processing
):
    student = await create_student(teacher)
    homework = await assign(teacher, await create_homework(teacher), [student])
    work = (
        await send_submission(teacher, homework["assignments"][0]["id"], homework["tasks"])
    ).json()
    await publish_submission(teacher, work, "confirmed")
    response = await teacher.post(
        "/api/materials", json={"workId": work["id"], "taskId": homework["tasks"][0]["id"]}
    )
    assert response.status_code == 200

    async def withdraw():
        assert (await teacher.post(f"/api/works/{work['id']}/actions/withdraw")).status_code == 200

    class MaterialProvider(HomeworkProvider):
        async def generate_material(self, topic_id, reason):
            self.calls += 1
            if during_processing:
                await withdraw()
            return await super().generate_material(topic_id, reason)

    if not during_processing:
        await withdraw()
    provider = MaterialProvider()
    await run_job(sessions, test_settings, storage, provider)
    result = (await teacher.get(f"/api/homework-jobs/{response.json()['id']}")).json()
    assert result["status"] == "stale"
    assert provider.calls == int(during_processing)
    events = (await teacher.get("/api/events")).json()["items"]
    assert sum(event["kind"] == "remediation_stale" for event in events) == 1


async def test_failed_recognition_retries_without_losing_upload(
    teacher, sessions, test_settings, storage
):
    class FailingProvider(HomeworkProvider):
        async def recognize_conditions(self, text, pages):
            if self.calls == 0:
                self.calls += 1
                raise ProviderError("provider_unavailable")
            return await super().recognize_conditions(text, pages)

    homework = await checked_condition(
        teacher, await upload_condition(teacher, await create_homework(teacher))
    )
    job = (await recognize(teacher, homework)).json()
    provider = FailingProvider()
    await run_job(sessions, test_settings, storage, provider)
    assert (await teacher.get(f"/api/homework-jobs/{job['id']}")).json()["status"] == "queued"
    async with sessions() as session:
        await session.execute(
            update(Job).where(Job.kind == "condition_recognition").values(run_after=func.now())
        )
        await session.commit()
    await run_job(sessions, test_settings, storage, provider)
    assert (await teacher.get(f"/api/homework-jobs/{job['id']}")).json()["status"] == "ready"
    assert (
        await teacher.get(f"/api/homework-files/{homework['files'][0]['id']}")
    ).status_code == 200


async def test_storage_failure_is_reported_and_draft_is_kept(teacher, storage):
    homework = await create_homework(teacher)
    storage.failures = 1
    response = await teacher.post(
        f"/api/homework/{homework['id']}/files",
        files={"file": ("condition.png", picture("PNG"), "image/png")},
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "storage_unavailable"
    assert (await teacher.get(f"/api/homework/{homework['id']}")).json()["files"] == []
