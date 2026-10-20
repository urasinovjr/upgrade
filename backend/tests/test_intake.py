import asyncio
from uuid import uuid4

from sqlalchemy import func, select

from app.queue import enqueue
from app.stand import StandResult, StandWork

BODY = {"teacher_id": "teacher-1", "student_id": "student-1", "pages": 2}


async def count(sessions, model) -> int:
    async with sessions() as session:
        return await session.scalar(select(func.count()).select_from(model))


async def test_repeated_upload_returns_same_job(client, sessions):
    first = await client.post("/works", json=BODY, headers={"Idempotency-Key": "upload-1"})
    second = await client.post("/works", json=BODY, headers={"Idempotency-Key": "upload-1"})

    assert first.status_code == 202
    assert second.json()["id"] == first.json()["id"]
    assert await count(sessions, StandWork) == 1


async def test_parallel_retries_create_one_work(client, sessions):
    requests = [
        client.post("/works", json=BODY, headers={"Idempotency-Key": "upload-2"}) for _ in range(10)
    ]
    responses = await asyncio.gather(*requests)

    assert {response.json()["id"] for response in responses} == {responses[0].json()["id"]}
    assert await count(sessions, StandWork) == 1


async def test_upload_without_key_is_rejected(client):
    response = await client.post("/works", json=BODY)

    assert response.status_code == 422


async def test_sync_upload_returns_result(client, sessions):
    response = await client.post("/sync/works", json=BODY, headers={"X-Upload-Id": "upload-3"})

    assert response.status_code == 200
    assert response.json()["text"] == "text of upload-3"
    assert await count(sessions, StandResult) == 1


async def test_sync_failure_leaves_no_work(failing_client, sessions):
    response = await failing_client.post(
        "/sync/works", json=BODY, headers={"X-Upload-Id": "upload-4"}
    )

    assert response.status_code == 502
    assert response.json() == {"detail": "provider_unavailable"}
    assert await count(sessions, StandWork) == 0


async def test_unknown_job_is_not_found(client):
    response = await client.get("/jobs/00000000-0000-0000-0000-000000000000")

    assert response.status_code == 404
    assert response.json() == {"detail": "job_not_found"}


async def test_other_job_kinds_are_hidden_from_stand(client, sessions):
    async with sessions() as session:
        job = await enqueue(session, "send_email", uuid4(), 3)
        await session.commit()

    response = await client.get(f"/jobs/{job.id}")

    assert response.status_code == 404
