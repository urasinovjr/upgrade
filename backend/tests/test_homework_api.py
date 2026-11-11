from datetime import UTC, datetime, timedelta
from uuid import uuid4

from tests.homework import (
    assign,
    create_homework,
    homework_task,
    publish_submission,
    send_submission,
)
from tests.students import create_student, end_all_subscriptions
from tests.works import confirmed_work, save


async def test_assign_freezes_conditions_and_multiple_recipients(teacher, other_teacher):
    students = [await create_student(teacher), await create_student(teacher)]
    foreign = await create_student(other_teacher)
    homework = await create_homework(teacher)
    invalid = await teacher.post(
        f"/api/homework/{homework['id']}/assign",
        json={"studentIds": [students[0], foreign], "baseRevision": homework["revision"]},
    )
    assert invalid.status_code == 404
    assert (await teacher.get(f"/api/homework/{homework['id']}")).json()["assignments"] == []
    assigned = await assign(teacher, homework, students)
    assert {item["studentId"] for item in assigned["assignments"]} == set(students)
    assert assigned["deadline"] is None
    frozen = await teacher.put(
        f"/api/homework/{homework['id']}",
        json={"title": "Другое", "tasks": homework["tasks"], "baseRevision": assigned["revision"]},
    )
    assert frozen.status_code == 409
    assert frozen.json()["detail"] == "homework_frozen"
    copied = await teacher.post(f"/api/homework/{homework['id']}/copy")
    assert copied.status_code == 200
    assert copied.json()["tasks"] == homework["tasks"]
    assert copied.json()["assignedAt"] is None
    assert copied.json()["assignments"] == []


async def test_unconfirmed_tasks_conflicts_and_exam_versions(teacher):
    student = await create_student(teacher)
    task = homework_task(confirmed=False)
    homework = await create_homework(teacher, [task])
    blocked = await teacher.post(
        f"/api/homework/{homework['id']}/assign",
        json={"studentIds": [student], "baseRevision": homework["revision"]},
    )
    assert blocked.status_code == 409
    task["confirmed"] = True
    task["exam"] = {
        "exam": "ege",
        "level": "profile",
        "year": 2026,
        "documentVersion": "fipi-2026-final",
        "position": 20,
    }
    wrong = await teacher.put(
        f"/api/homework/{homework['id']}",
        json={"title": "Экзамен", "tasks": [task], "baseRevision": homework["revision"]},
    )
    assert wrong.status_code == 422
    task["exam"].update(year=2027, documentVersion="fipi-2027-project-2026-09-22")
    good = await teacher.put(
        f"/api/homework/{homework['id']}",
        json={"title": "Экзамен", "tasks": [task], "baseRevision": homework["revision"]},
    )
    assert good.status_code == 200, good.text
    conflict = await teacher.put(
        f"/api/homework/{homework['id']}",
        json={"title": "Конфликт", "tasks": [], "baseRevision": homework["revision"]},
    )
    assert conflict.status_code == 409


async def test_submissions_lateness_snapshot_and_resubmission(teacher):
    student = await create_student(teacher)
    homework = await create_homework(teacher, [homework_task(), homework_task(title="Задача 2")])
    yesterday = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    homework = await assign(teacher, homework, [student], yesterday)
    assignment = homework["assignments"][0]["id"]
    work_id = str(uuid4())
    first = await send_submission(teacher, assignment, homework["tasks"], work_id=work_id)
    assert first.status_code == 200, first.text
    work = first.json()
    assert work["late"] is True
    assert work["submissionSnapshot"]["deadline"] == yesterday
    assert len(work["taskFiles"][homework["tasks"][0]["id"]]) == 2
    assert work["draft"]["tasks"][1]["omitted"] is True
    assert work["draft"]["tasks"][1].get("gap") is None
    retry = await send_submission(teacher, assignment, homework["tasks"], work_id=work_id)
    assert retry.status_code == 200
    assert retry.json()["attachments"] == work["attachments"]
    pending = await send_submission(teacher, assignment, homework["tasks"])
    assert pending.status_code == 409
    changed = await teacher.put(f"/api/homework/{homework['id']}/deadline", json={"deadline": None})
    assert changed.status_code == 200
    assert (await teacher.get(f"/api/works/{work_id}")).json()["late"] is True
    altered = {
        **work["draft"],
        "tasks": [{**task, "condition": "Изменение"} for task in work["draft"]["tasks"]],
    }
    assert (await save(teacher, work, altered)).status_code == 409
    await publish_submission(teacher, work)
    second = await send_submission(teacher, assignment, homework["tasks"], omit=True)
    assert second.status_code == 200, second.text
    assert second.json()["id"] != work_id
    assert second.json()["late"] is False
    assert second.json()["attachments"] == []
    assert all(task["omitted"] for task in second.json()["draft"]["tasks"])
    assert (await teacher.get(f"/api/works/{work_id}")).json()["currentPublishedId"]


async def test_old_works_are_preserved_and_subscription_blocks_writes(teacher, sessions):
    student = await create_student(teacher)
    old_work = await confirmed_work(teacher, student)
    homework = await assign(teacher, await create_homework(teacher), [student])
    await end_all_subscriptions(sessions)
    assert (await teacher.get(f"/api/works/{old_work['id']}/report")).status_code == 200
    assert (await teacher.get("/api/homework")).status_code == 200
    assert (await teacher.post(f"/api/homework/{homework['id']}/copy")).status_code == 402
    assert (
        await teacher.put(f"/api/homework/{homework['id']}/deadline", json={"deadline": None})
    ).status_code == 402
    assert (await teacher.post(f"/api/students/{student}/invitation")).status_code == 402
    assert (
        await send_submission(teacher, homework["assignments"][0]["id"], homework["tasks"])
    ).status_code == 402
