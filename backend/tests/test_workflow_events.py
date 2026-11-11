from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from app.events import ProductEvent, record_event
from app.timing.service import enroll
from tests.homework import assign, create_homework, publish_submission, send_submission
from tests.students import create_student


@pytest.fixture
async def session(sessions):
    async with sessions() as session:
        yield session


async def test_submission_events_are_transactional_deduplicated_and_private(teacher, other_teacher):
    student = await create_student(teacher)
    homework = await assign(teacher, await create_homework(teacher), [student])
    assignment = homework["assignments"][0]["id"]
    work_id = str(uuid4())
    first = await send_submission(teacher, assignment, homework["tasks"], work_id=work_id)
    assert first.status_code == 200
    assert (
        await send_submission(teacher, assignment, homework["tasks"], work_id=work_id)
    ).status_code == 200
    events = (await teacher.get("/api/events")).json()["items"]
    assert [event["kind"] for event in events] == [
        "homework_created",
        "homework_assigned",
        "submission_received",
        "submission_stored",
    ]
    assert all(event["schemaVersion"] == 1 and event["source"] == "user" for event in events)
    assert all(
        set(event)
        == {
            "id",
            "kind",
            "entityId",
            "revision",
            "source",
            "schemaVersion",
            "appVersion",
            "occurredAt",
        }
        for event in events
    )
    assert (await other_teacher.get("/api/events")).json()["items"] == []
    await publish_submission(teacher, first.json())
    kinds = [event["kind"] for event in (await teacher.get("/api/events")).json()["items"]]
    assert kinds.count("teacher_confirmed") == kinds.count("result_published") == 1


async def test_event_rollback_and_cursor_boundaries(teacher, other_teacher, session):
    homework = await create_homework(teacher)
    foreign = await create_student(other_teacher)
    response = await teacher.post(
        f"/api/homework/{homework['id']}/assign",
        json={"studentIds": [foreign], "baseRevision": homework["revision"]},
    )
    assert response.status_code == 404
    existing = (await teacher.get("/api/events")).json()["items"]
    assert [event["kind"] for event in existing] == ["homework_created"]
    teacher_id = await session.scalar(select(ProductEvent.teacher_id))
    subject = uuid4()
    await record_event(session, teacher_id, "rollback_probe", subject)
    await session.rollback()
    assert (await teacher.get("/api/events")).json()["items"] == existing
    await record_event(session, teacher_id, "cursor_probe", subject)
    await record_event(session, teacher_id, "cursor_probe", subject)
    await session.commit()
    first = (await teacher.get("/api/events?limit=1")).json()
    second = (await teacher.get("/api/events", params={"cursor": first["nextCursor"]})).json()
    assert len(first["items"]) == len(second["items"]) == 1
    assert second["items"][0]["kind"] == "cursor_probe"
    assert second["nextCursor"] is None
    assert (
        await other_teacher.get("/api/events", params={"cursor": first["nextCursor"]})
    ).status_code == 404


async def test_homework_source_survives_save_and_copy(teacher):
    homework = await create_homework(teacher)
    body = {
        "title": homework["title"],
        "tasks": homework["tasks"],
        "sourceText": "Исходный текст условия",
        "baseRevision": homework["revision"],
    }
    response = await teacher.put(f"/api/homework/{homework['id']}", json=body)
    assert response.status_code == 200
    updated = response.json()
    without_source = await teacher.put(
        f"/api/homework/{homework['id']}",
        json={
            "title": "Обновлённое ДЗ",
            "tasks": homework["tasks"],
            "baseRevision": updated["revision"],
        },
    )
    assert without_source.status_code == 200
    assert without_source.json()["sourceText"] == body["sourceText"]
    assert (await teacher.get(f"/api/homework/{homework['id']}")).json()["sourceText"] == body[
        "sourceText"
    ]
    assert (await teacher.post(f"/api/homework/{homework['id']}/copy")).json()[
        "sourceText"
    ] == body["sourceText"]


async def test_homework_active_time_targets_and_retry(teacher, other_teacher, session):
    homework = await create_homework(teacher)
    foreign = await create_homework(other_teacher)
    teacher_id = await session.scalar(
        select(ProductEvent.teacher_id).where(ProductEvent.entity_id == UUID(homework["id"]))
    )
    await enroll(session, teacher_id, "workflow regression")
    await session.commit()
    end = datetime.now(UTC)
    interval = {
        "id": str(uuid4()),
        "homeworkId": homework["id"],
        "stage": "teacher_upload",
        "startedAt": (end - timedelta(seconds=30)).isoformat(),
        "endedAt": end.isoformat(),
    }
    first = await teacher.post("/api/timing/intervals", json={"intervals": [interval]})
    assert first.json()["accepted"] == 1
    assert (await teacher.post("/api/timing/intervals", json={"intervals": [interval]})).json()[
        "accepted"
    ] == 0
    unknown = {**interval, "id": str(uuid4()), "homeworkId": foreign["id"]}
    assert (await teacher.post("/api/timing/intervals", json={"intervals": [unknown]})).json()[
        "unknownWorkIds"
    ] == [foreign["id"]]
    summary = (await teacher.get("/api/timing/summary")).json()
    assert summary == [
        {
            "workId": None,
            "homeworkId": homework["id"],
            "stage": "teacher_upload",
            "activeSeconds": 30.0,
        }
    ]
