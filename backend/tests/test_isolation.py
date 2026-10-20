from tests.students import create_student, student_data


async def test_other_teacher_cannot_touch_student(teacher, other_teacher):
    student_id = await create_student(teacher)

    overwrite = await other_teacher.put(
        f"/api/students/{student_id}", json=student_data(name="Чужая")
    )
    archive = await other_teacher.post(
        f"/api/students/{student_id}/archive", json={"archived": True}
    )
    closure = await other_teacher.post(
        f"/api/students/{student_id}/closures",
        json={"topicId": "fractions", "action": "close", "note": "чужой"},
    )
    own_state = await teacher.get("/api/state")
    other_state = await other_teacher.get("/api/state")

    assert overwrite.status_code == 404
    assert archive.status_code == 404
    assert closure.status_code == 404
    assert own_state.json()["students"][0]["name"] == "Мария"
    assert own_state.json()["students"][0]["archivedAt"] is None
    assert own_state.json()["closures"] == []
    assert other_state.json() == {"students": [], "works": [], "closures": []}
