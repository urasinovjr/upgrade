from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import func, select

from app.cli import run
from app.timing import ActiveInterval
from app.timing.report import savings, summary
from tests.students import create_student
from tests.works import confirmed_work, create_work

NOW = datetime.now(UTC).replace(microsecond=0)


def interval(work_id: str, minutes: float, stage: str = "review", **changes) -> dict:
    started = NOW - timedelta(hours=1)
    data = {
        "id": str(uuid4()),
        "workId": work_id,
        "stage": stage,
        "startedAt": started.isoformat(),
        "endedAt": (started + timedelta(minutes=minutes)).isoformat(),
    }
    return {**data, **changes}


def manual(student_id: str, seconds: int, **changes) -> dict:
    data = {
        "studentId": student_id,
        "taskCount": 2,
        "taskFamily": "equations",
        "activeSeconds": seconds,
        "startedAt": (NOW - timedelta(hours=2)).isoformat(),
        "finishedAt": (NOW - timedelta(hours=1)).isoformat(),
    }
    return {**data, **changes}


async def enroll(test_settings, email: str = "first@example.com") -> None:
    assert "is on" in await run(["pilot-enroll", "--email", email], test_settings)


def test_summary_and_savings_use_medians():
    found = summary([60.0, 120.0, 180.0, 600.0])

    assert found is not None and found.median == 150
    assert (found.smallest, found.largest) == (60, 600)
    assert savings([100.0, 200.0, 900.0], [400.0, 500.0]) == 1 - 200 / 450
    assert savings([], [400.0]) is None


async def test_timing_is_closed_for_teachers_outside_the_pilot(teacher, test_settings):
    status = await teacher.get("/api/timing")
    sent = await teacher.post("/api/timing/intervals", json={"intervals": []})

    assert status.json() == {"enabled": False}
    assert sent.status_code == 403
    assert sent.json() == {"detail": "timing_disabled"}


async def test_intervals_are_stored_once_and_checked(teacher, sessions, test_settings):
    await enroll(test_settings)
    work = await create_work(teacher, await create_student(teacher))
    first = interval(work["id"], 3)
    batch = [
        first,
        interval(work["id"], 20),
        interval(work["id"], 1, startedAt=(NOW + timedelta(hours=1)).isoformat()),
        interval(str(uuid4()), 2),
    ]

    stored = (await teacher.post("/api/timing/intervals", json={"intervals": batch})).json()
    again = (await teacher.post("/api/timing/intervals", json={"intervals": [first]})).json()
    async with sessions() as session:
        count = await session.scalar(select(func.count()).select_from(ActiveInterval))

    assert (stored["accepted"], stored["rejected"]) == (1, 2)
    assert stored["unknownWorkIds"] == [batch[3]["workId"]]
    assert again == {"accepted": 0, "rejected": 0, "unknownWorkIds": []}
    assert (await teacher.get("/api/timing")).json() == {"enabled": True}
    assert count == 1


async def test_other_teacher_cannot_log_time_for_a_foreign_work(
    teacher, other_teacher, sessions, test_settings
):
    await enroll(test_settings, "second@example.com")
    work = await create_work(teacher, await create_student(teacher))
    foreign_student = await create_student(teacher)

    sent = await other_teacher.post(
        "/api/timing/intervals", json={"intervals": [interval(work["id"], 2)]}
    )
    session_id = str(uuid4())
    saved = await other_teacher.put(
        f"/api/timing/manual/{session_id}", json=manual(foreign_student, 600)
    )

    assert sent.json()["unknownWorkIds"] == [work["id"]]
    assert saved.status_code == 404


async def test_manual_session_is_saved_corrected_and_deleted(teacher, test_settings):
    await enroll(test_settings)
    student_id = await create_student(teacher)
    session_id = str(uuid4())

    created = await teacher.put(f"/api/timing/manual/{session_id}", json=manual(student_id, 900))
    corrected = await teacher.put(
        f"/api/timing/manual/{session_id}", json=manual(student_id, 900, correctedSeconds=840)
    )
    listed = (await teacher.get("/api/timing/manual")).json()
    removed = await teacher.delete(f"/api/timing/manual/{session_id}")
    missing = await teacher.delete(f"/api/timing/manual/{session_id}")

    assert created.status_code == 200, created.text
    assert corrected.json()["correctedSeconds"] == 840
    assert [item["id"] for item in listed] == [session_id]
    assert removed.status_code == 204
    assert missing.status_code == 404


async def test_deleting_a_work_removes_its_intervals(teacher, sessions, test_settings):
    await enroll(test_settings)
    work = await create_work(teacher, await create_student(teacher))
    await teacher.post("/api/timing/intervals", json={"intervals": [interval(work["id"], 2)]})

    await teacher.delete(f"/api/works/{work['id']}")
    async with sessions() as session:
        count = await session.scalar(select(func.count()).select_from(ActiveInterval))

    assert count == 0


async def test_report_compares_confirmed_works_with_manual_checks(teacher, test_settings):
    await enroll(test_settings)
    student_id = await create_student(teacher)
    confirmed = await confirmed_work(teacher, student_id)
    draft = await create_work(teacher, student_id)
    intervals = [
        interval(confirmed["id"], 4, "preparation"),
        interval(confirmed["id"], 6, "review"),
        interval(draft["id"], 9),
    ]
    await teacher.post("/api/timing/intervals", json={"intervals": intervals})
    for seconds in (1200, 1800):
        await teacher.put(f"/api/timing/manual/{uuid4()}", json=manual(student_id, seconds))

    empty = await run(["timing-report", "--until", "2000-01-01"], test_settings)
    text = await run(["timing-report"], test_settings)
    table = await run(["timing-report", "--csv"], test_settings)

    assert "UpGrade, активное время на работу: нет данных" in empty
    assert "Экономия по медианам: нет данных" in empty
    assert "UpGrade, активное время на работу: n=1 медиана 10.0 мин" in text
    assert "Ручная проверка, время на работу: n=2 медиана 25.0 мин" in text
    assert "Экономия по медианам: 0.60 (цель не меньше 0.50, цель достигнута)" in text
    assert "Этап preparation: n=1 медиана 4.0 мин" in text
    assert len(table.splitlines()) == 4
    assert table.splitlines()[1].startswith("upgrade,")


async def test_other_teacher_cannot_change_or_delete_a_manual_session(
    teacher, other_teacher, test_settings
):
    await enroll(test_settings)
    await enroll(test_settings, "second@example.com")
    student_id = await create_student(teacher)
    own_student = await create_student(other_teacher)
    session_id = str(uuid4())
    await teacher.put(f"/api/timing/manual/{session_id}", json=manual(student_id, 900))

    overwrite = await other_teacher.put(
        f"/api/timing/manual/{session_id}", json=manual(own_student, 60)
    )
    removed = await other_teacher.delete(f"/api/timing/manual/{session_id}")
    listed = (await teacher.get("/api/timing/manual")).json()

    assert overwrite.status_code == 404
    assert removed.status_code == 404
    assert [(item["id"], item["activeSeconds"]) for item in listed] == [(session_id, 900)]
    assert (await other_teacher.get("/api/timing/manual")).json() == []
