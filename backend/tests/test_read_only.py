from uuid import uuid4

from tests.students import create_student, end_all_subscriptions, student_data


async def test_expired_subscription_blocks_changes_but_not_reading(teacher, sessions):
    student_id = await create_student(teacher)
    await end_all_subscriptions(sessions)

    create = await teacher.put(f"/api/students/{uuid4()}", json=student_data())
    closure = await teacher.post(
        f"/api/students/{student_id}/closures",
        json={"topicId": "fractions", "action": "close", "note": "основание"},
    )
    archive = await teacher.post(f"/api/students/{student_id}/archive", json={"archived": True})
    layout = await teacher.put("/api/account/preferences/dashboard-layout", json={"v": 1})
    state = await teacher.get("/api/state")

    assert create.status_code == 402
    assert create.json() == {"detail": "subscription_inactive"}
    assert closure.status_code == 402
    assert archive.status_code == 200
    assert layout.status_code == 204
    assert state.status_code == 200
