from tests.students import create_student, student_data
from tests.works import confirmed_work, create_work, upload_work


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
    assert own_state.json()["students"][0].get("archivedAt") is None
    assert own_state.json()["closures"] == []
    assert other_state.json() == {"students": [], "works": [], "closures": []}


async def test_other_teacher_cannot_reach_work_or_files(teacher, other_teacher):
    student_id = await create_student(teacher)
    work = await confirmed_work(teacher, student_id)
    work_id = work["id"]
    file_id = work["attachments"][0]["id"]
    layout = [{"id": file_id, "pageOrder": [1], "crops": {}}]
    draft = {"baseRevision": work["draft"]["revision"], "draft": work["draft"]}

    responses = [
        await other_teacher.get(f"/api/works/{work_id}"),
        await other_teacher.put(f"/api/works/{work_id}/draft", json=draft),
        await other_teacher.put(f"/api/works/{work_id}/attachments", json=layout),
        await other_teacher.post(f"/api/works/{work_id}/actions/edit"),
        await other_teacher.post(f"/api/works/{work_id}/actions/withdraw"),
        await other_teacher.post(f"/api/works/{work_id}/actions/analyse"),
        await other_teacher.get(f"/api/works/{work_id}/report"),
        await other_teacher.get(f"/api/files/{file_id}"),
        await upload_work(other_teacher, student_id),
    ]
    own = await teacher.get(f"/api/works/{work_id}")

    assert [response.status_code for response in responses] == [404] * len(responses)
    assert own.json()["status"] == "confirmed"
    assert (await other_teacher.get("/api/state")).json()["works"] == []


async def test_work_id_of_other_teacher_cannot_be_reused(teacher, other_teacher):
    student_id = await create_student(teacher)
    own_student = await create_student(other_teacher)
    work = await create_work(teacher, student_id)

    response = await upload_work(other_teacher, own_student, work_id=work["id"])

    assert response.status_code == 409
