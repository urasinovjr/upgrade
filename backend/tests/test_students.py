from uuid import uuid4

import pytest

from tests.students import create_student, student_data


async def test_student_is_created_and_updated(teacher):
    student_id = await create_student(teacher)

    updated = await teacher.put(
        f"/api/students/{student_id}", json=student_data(name="  Мария К. ", grade=11)
    )
    state = await teacher.get("/api/state")

    assert updated.json()["name"] == "Мария К."
    assert [item["grade"] for item in state.json()["students"]] == [11]


async def test_student_fields_are_validated(teacher):
    student_id = uuid4()
    blank = await teacher.put(f"/api/students/{student_id}", json=student_data(name="  "))
    grade = await teacher.put(f"/api/students/{student_id}", json=student_data(grade=8))
    extra = await teacher.put(f"/api/students/{student_id}", json=student_data(notes="x"))

    assert {blank.status_code, grade.status_code, extra.status_code} == {422}


async def test_student_keeps_other_forms_of_the_name(teacher):
    student_id = await create_student(teacher)

    saved = await teacher.put(
        f"/api/students/{student_id}", json=student_data(aliases=[" Машуня ", "Masha"])
    )
    kept = await teacher.put(f"/api/students/{student_id}", json=student_data())
    state = await teacher.get("/api/state")

    assert saved.json()["aliases"] == ["Машуня", "Masha"]
    assert kept.json()["aliases"] == []
    assert state.json()["students"][0]["aliases"] == []


@pytest.mark.parametrize("aliases", [[""], ["я" * 41], [f"Имя{index}" for index in range(11)]])
async def test_other_forms_of_the_name_are_limited(teacher, aliases):
    response = await teacher.put(f"/api/students/{uuid4()}", json=student_data(aliases=aliases))

    assert response.status_code == 422


async def test_archived_student_stays_in_state(teacher):
    student_id = await create_student(teacher)

    archived = await teacher.post(f"/api/students/{student_id}/archive", json={"archived": True})
    restored = await teacher.post(f"/api/students/{student_id}/archive", json={"archived": False})

    assert archived.json()["archivedAt"] is not None
    assert restored.json()["archivedAt"] is None


@pytest.mark.prd(12)
async def test_closing_gap_needs_reason(teacher):
    student_id = await create_student(teacher)
    url = f"/api/students/{student_id}/closures"

    missing = await teacher.post(url, json={"topicId": "fractions", "action": "close", "note": " "})
    closed = await teacher.post(
        url, json={"topicId": "fractions", "action": "close", "note": "Решила 5 задач"}
    )
    reopened = await teacher.post(
        url, json={"topicId": "fractions", "action": "reopen", "note": ""}
    )
    state = await teacher.get("/api/state")

    assert missing.json() == {"detail": "closure_note_required"}
    assert closed.status_code == 201
    assert reopened.status_code == 201
    assert [item["action"] for item in state.json()["closures"]] == ["close", "reopen"]
    assert state.json()["closures"][0]["studentId"] == student_id
    assert "at" in state.json()["closures"][0]


async def test_dashboard_layout_is_saved_per_account(teacher, other_teacher):
    layout = {"version": 1, "widgets": [{"id": "queue", "span": 8}]}

    empty = await teacher.get("/api/account/preferences/dashboard-layout")
    saved = await teacher.put("/api/account/preferences/dashboard-layout", json=layout)
    loaded = await teacher.get("/api/account/preferences/dashboard-layout")
    foreign = await other_teacher.get("/api/account/preferences/dashboard-layout")
    unknown = await teacher.put("/api/account/preferences/theme", json=layout)
    huge = await teacher.put(
        "/api/account/preferences/dashboard-layout", json={"blob": "x" * 20000}
    )

    assert empty.json() is None
    assert saved.status_code == 204
    assert loaded.json() == layout
    assert foreign.json() is None
    assert unknown.status_code == 422
    assert huge.status_code == 413


async def test_onboarding_is_saved_per_account_apart_from_the_layout(teacher, other_teacher):
    onboarding = {"version": 1, "tour": "skipped", "hints": ["review"]}
    layout = {"version": 1, "widgets": [{"id": "queue", "span": 8}]}

    empty = await teacher.get("/api/account/preferences/onboarding")
    await teacher.put("/api/account/preferences/dashboard-layout", json=layout)
    saved = await teacher.put("/api/account/preferences/onboarding", json=onboarding)
    loaded = await teacher.get("/api/account/preferences/onboarding")
    kept_layout = await teacher.get("/api/account/preferences/dashboard-layout")
    foreign = await other_teacher.get("/api/account/preferences/onboarding")
    huge = await teacher.put("/api/account/preferences/onboarding", json={"blob": "x" * 20000})

    assert empty.json() is None
    assert saved.status_code == 204
    assert loaded.json() == onboarding
    assert kept_layout.json() == layout
    assert foreign.json() is None
    assert huge.status_code == 413
