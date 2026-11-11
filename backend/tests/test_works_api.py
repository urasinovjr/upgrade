import asyncio
import json
from uuid import uuid4

import pytest

from tests.accounts import sign_up
from tests.conftest import FakeProvider, make_client
from tests.samples import JPEG_BYTES, PNG_BYTES, pdf_bytes
from tests.students import create_student
from tests.works import (
    act,
    confirmed_work,
    create_work,
    finished_task,
    save,
    task,
    upload_work,
)


async def test_work_is_created_with_detected_files(teacher):
    student_id = await create_student(teacher)

    work = await create_work(
        teacher, student_id, files=[("photo.png", PNG_BYTES), ("scan.pdf", pdf_bytes(3))]
    )
    state = await teacher.get("/api/state")

    assert work["status"] == "preparation"
    assert (work["editing"], work["manual"], work["demo"]) == (True, True, False)
    assert [(item["type"], item["pages"]) for item in work["attachments"]] == [
        ("image/png", 1),
        ("application/pdf", 3),
    ]
    assert work["attachments"][1]["pageOrder"] == [1, 2, 3]
    draft = work["draft"]
    assert (draft["revision"], draft["inputRevision"], draft["analysedInputRevision"]) == (1, 0, -1)
    assert work["published"] == []
    assert "job" not in work
    assert [item["id"] for item in state.json()["works"]] == [work["id"]]


async def test_file_is_streamed_back(teacher):
    student_id = await create_student(teacher)
    work = await create_work(teacher, student_id, files=[("фото.jpg", JPEG_BYTES)])

    response = await teacher.get(f"/api/files/{work['attachments'][0]['id']}")

    assert response.content == JPEG_BYTES
    assert response.headers["content-type"] == "image/jpeg"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "filename*=UTF-8''%D1%84" in response.headers["content-disposition"]


async def test_repeated_upload_returns_same_work(teacher):
    student_id = await create_student(teacher)
    work_id, file_id = str(uuid4()), str(uuid4())

    first = await upload_work(teacher, student_id, work_id=work_id, attachment_ids=[file_id])
    second = await upload_work(teacher, student_id, work_id=work_id, attachment_ids=[file_id])
    state = await teacher.get("/api/state")

    assert first.status_code == second.status_code == 200
    assert len(state.json()["works"]) == 1


async def test_condition_files_are_kept_only_when_uploaded(teacher):
    student_id = await create_student(teacher)
    file_id = str(uuid4())
    tasks = [task(conditionAttachmentIds=[file_id, "missing"])]

    work = await create_work(teacher, student_id, attachment_ids=[file_id], tasks=tasks)

    assert work["draft"]["tasks"][0]["conditionAttachmentIds"] == [file_id]


async def test_file_type_comes_from_content(teacher):
    student_id = await create_student(teacher)

    spoofed = await upload_work(teacher, student_id, files=[("photo.png", b"GIF89a....")])
    broken = await upload_work(teacher, student_id, files=[("scan.pdf", b"%PDF-1.7 broken")])

    assert spoofed.status_code == 415
    assert broken.json() == {"detail": "file_unreadable"}


async def test_upload_limits(sessions, test_settings):
    settings = test_settings.model_copy(
        update={"max_file_bytes": 1000, "max_pages_per_work": 2, "max_files_per_work": 2}
    )
    async for client in make_client(settings, FakeProvider()):
        await sign_up(client, sessions, "limits@example.com")
        student_id = await create_student(client)
        big = await upload_work(client, student_id, files=[("a.png", PNG_BYTES + b"0" * 1000)])
        pages = await upload_work(client, student_id, files=[("a.pdf", pdf_bytes(3))])
        files = await upload_work(
            client, student_id, files=[("a.png", PNG_BYTES), ("b.png", PNG_BYTES)] * 2
        )

    assert big.json() == {"detail": "file_too_large"}
    assert pages.json() == {"detail": "too_many_pages"}
    assert files.status_code in (400, 422)


async def test_meta_must_match_files(teacher):
    student_id = await create_student(teacher)
    meta = {
        "id": str(uuid4()),
        "studentId": student_id,
        "title": "Работа",
        "attachments": [{"id": str(uuid4()), "name": "a.png"}],
        "tasks": [],
    }

    mismatch = await teacher.post(
        "/api/works",
        data={"meta": json.dumps(meta)},
        files={str(uuid4()): ("a.png", PNG_BYTES, "image/png")},
    )
    unknown_student = await upload_work(teacher, str(uuid4()))
    bad_meta = await teacher.post("/api/works", data={"meta": "{"}, files={"x": ("a", b"1")})

    assert mismatch.json() == {"detail": "attachments_mismatch"}
    assert unknown_student.json() == {"detail": "student_not_found"}
    assert bad_meta.json() == {"detail": "work_meta_invalid"}


@pytest.mark.prd(6)
async def test_draft_save_tracks_input_changes(teacher):
    student_id = await create_student(teacher)
    work = await create_work(teacher, student_id)
    reviewed = {**work["draft"], "tasks": [task(reviewed=True)], "feedback": "Хорошо"}

    first = await save(teacher, work, reviewed)
    changed_input = {**reviewed, "tasks": [task(reviewed=True, formula="x^2=9")]}
    second = await save(teacher, work, changed_input, base=2)
    stale = await save(teacher, work, reviewed, base=1)
    stored = (await teacher.get(f"/api/works/{work['id']}")).json()

    assert first.json() == {"revision": 2, "inputRevision": 0}
    assert second.json() == {"revision": 3, "inputRevision": 1}
    assert stale.status_code == 409
    assert stale.json() == {"detail": "draft_conflict", "revision": 3}
    assert stored["draft"]["tasks"][0]["reviewed"] is False
    assert stored["draft"]["feedback"] == "Хорошо"


async def test_parallel_saves_have_one_winner(teacher):
    student_id = await create_student(teacher)
    work = await create_work(teacher, student_id)
    drafts = [{**work["draft"], "feedback": f"вариант {index}"} for index in range(2)]

    responses = await asyncio.gather(*(save(teacher, work, draft) for draft in drafts))

    assert sorted(response.status_code for response in responses) == [200, 409]


async def test_confirm_lists_blockers(teacher):
    student_id = await create_student(teacher)
    work = await create_work(teacher, student_id)

    response = await act(teacher, work["id"], "confirm")

    assert response.status_code == 409
    assert response.json()["detail"] == "review_blocked"
    assert (
        "Дождитесь разбора или сверьте работу с оригиналом вручную" in response.json()["blockers"]
    )


@pytest.mark.prd(9, 10)
async def test_confirm_edit_and_withdraw(teacher):
    student_id = await create_student(teacher)
    confirmed = await confirmed_work(teacher, student_id)
    work_id = confirmed["id"]

    report = await teacher.get(f"/api/works/{work_id}/report")
    edited = (await act(teacher, work_id, "edit")).json()
    finished = {**edited["draft"], "tasks": [finished_task()]}
    await save(teacher, edited, finished)
    again = (await act(teacher, work_id, "confirm")).json()
    first_report = await teacher.get(
        f"/api/works/{work_id}/report", params={"revisionId": confirmed["published"][0]["id"]}
    )
    withdrawn = (await act(teacher, work_id, "withdraw")).json()

    assert confirmed["status"] == "confirmed"
    assert confirmed["currentPublishedId"] == confirmed["published"][0]["id"]
    assert report.json()["revision"]["number"] == 1
    assert report.json()["student"]["name"] == "Мария"
    assert edited["editing"] is True
    assert edited["draft"]["tasks"][0]["reviewed"] is False
    assert [item["number"] for item in again["published"]] == [1, 2]
    assert first_report.json()["revision"]["number"] == 1
    assert withdrawn["editing"] is True
    assert "currentPublishedId" not in withdrawn
    assert (await teacher.get(f"/api/works/{work_id}/report")).status_code == 404


async def test_confirmed_work_is_closed_for_edits(teacher):
    student_id = await create_student(teacher)
    work = await confirmed_work(teacher, student_id)

    response = await save(teacher, work, work["draft"])
    manual = await act(teacher, work["id"], "manual")

    assert response.json() == {"detail": "editing_closed"}
    assert manual.json() == {"detail": "editing_closed"}


@pytest.mark.prd(1)
async def test_attachments_are_reordered(teacher):
    student_id = await create_student(teacher)
    work = await create_work(
        teacher, student_id, files=[("a.png", PNG_BYTES), ("b.pdf", pdf_bytes(2))]
    )
    first, second = work["attachments"]
    layout = [
        {
            "id": second["id"],
            "pageOrder": [2, 1],
            "crops": {"1": {"x": 0, "y": 0, "width": 1, "height": 1}},
        },
        {"id": first["id"], "pageOrder": [1], "crops": {}},
    ]

    updated = await teacher.put(f"/api/works/{work['id']}/attachments", json=layout)
    invalid = await teacher.put(
        f"/api/works/{work['id']}/attachments",
        json=[{**layout[0], "pageOrder": [3]}, layout[1]],
    )
    partial = await teacher.put(f"/api/works/{work['id']}/attachments", json=layout[:1])

    body = updated.json()
    assert [item["name"] for item in body["attachments"]] == ["b.pdf", "a.png"]
    assert body["attachments"][0]["pageOrder"] == [2, 1]
    assert body["draft"]["inputRevision"] == 1
    assert body["draft"]["revision"] == 2
    assert invalid.json() == {"detail": "attachments_mismatch"}
    assert partial.json() == {"detail": "attachments_mismatch"}
