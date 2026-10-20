import json
from uuid import uuid4

from httpx import AsyncClient, Response

from tests.samples import PNG_BYTES, pdf_bytes


def task(task_id: str = "t1", **changes) -> dict:
    data = {
        "id": task_id,
        "title": "Задача 1",
        "condition": "Решите уравнение",
        "formula": "x^2=4",
        "reference": "",
        "topicId": "equations",
        "steps": [{"id": "s1", "latex": "x=2", "verdict": "uncertain", "explanation": ""}],
        "feedback": "",
        "reviewed": False,
        "omitted": False,
    }
    return {**data, **changes}


def finished_task(task_id: str = "t1") -> dict:
    steps = [{"id": "s1", "latex": "x=\\pm 2", "verdict": "correct", "explanation": ""}]
    return task(task_id, steps=steps, reviewed=True)


async def upload_work(
    client: AsyncClient,
    student_id: str,
    files: list[tuple[str, bytes]] | None = None,
    tasks: list[dict] | None = None,
    work_id: str | None = None,
    attachment_ids: list[str] | None = None,
) -> Response:
    files = files if files is not None else [("solution.png", PNG_BYTES)]
    ids = attachment_ids or [str(uuid4()) for _ in files]
    meta = {
        "id": work_id or str(uuid4()),
        "studentId": student_id,
        "title": "Контрольная 1",
        "attachments": [{"id": ids[i], "name": name} for i, (name, _) in enumerate(files)],
        "tasks": tasks if tasks is not None else [task()],
    }
    parts = {
        ids[i]: (name, data, "application/octet-stream") for i, (name, data) in enumerate(files)
    }
    return await client.post("/api/works", data={"meta": json.dumps(meta)}, files=parts)


async def create_work(client: AsyncClient, student_id: str, **options) -> dict:
    response = await upload_work(client, student_id, **options)
    assert response.status_code == 200, response.text
    return response.json()


async def save(client: AsyncClient, work: dict, draft: dict, base: int | None = None) -> Response:
    revision = work["draft"]["revision"] if base is None else base
    return await client.put(
        f"/api/works/{work['id']}/draft", json={"baseRevision": revision, "draft": draft}
    )


async def act(client: AsyncClient, work_id: str, action: str) -> Response:
    return await client.post(f"/api/works/{work_id}/actions/{action}")


async def finish_review(client: AsyncClient, work: dict) -> None:
    draft = {**work["draft"], "tasks": [finished_task()]}
    first = await save(client, work, draft)
    assert first.status_code == 200, first.text
    second = await save(client, work, draft, base=first.json()["revision"])
    assert second.status_code == 200, second.text


async def confirmed_work(client: AsyncClient, student_id: str) -> dict:
    work = await create_work(client, student_id)
    await finish_review(client, work)
    assert (await act(client, work["id"], "manual")).status_code == 200
    response = await act(client, work["id"], "confirm")
    assert response.status_code == 200, response.text
    return response.json()


def multi_page_pdf(pages: int) -> tuple[str, bytes]:
    return ("scan.pdf", pdf_bytes(pages))
