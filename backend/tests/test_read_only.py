from uuid import uuid4

from tests.students import create_student, end_all_subscriptions, student_data
from tests.works import act, confirmed_work, create_work, save, upload_work


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


async def test_expired_subscription_keeps_works_readable(teacher, sessions):
    student_id = await create_student(teacher)
    work = await confirmed_work(teacher, student_id)
    draft_work = await create_work(teacher, student_id)
    await end_all_subscriptions(sessions)

    blocked = [
        await upload_work(teacher, student_id),
        await save(teacher, draft_work, draft_work["draft"]),
        await act(teacher, draft_work["id"], "manual"),
        await act(teacher, work["id"], "edit"),
        await teacher.put(
            f"/api/works/{draft_work['id']}/attachments",
            json=[{"id": draft_work["attachments"][0]["id"], "pageOrder": [1], "crops": {}}],
        ),
    ]
    readable = [
        await teacher.get(f"/api/works/{work['id']}"),
        await teacher.get(f"/api/works/{work['id']}/report"),
        await teacher.get(f"/api/files/{work['attachments'][0]['id']}"),
    ]

    assert [response.status_code for response in blocked] == [402] * len(blocked)
    assert [response.status_code for response in readable] == [200] * len(readable)
