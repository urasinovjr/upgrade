from uuid import uuid4

from tests.accounts import PASSWORD
from tests.homework import assign, create_homework, learner, publish_submission, send_submission
from tests.students import create_student, end_all_subscriptions
from tests.works import act


async def test_invitation_one_time_recovery_and_csrf(teacher, test_settings, storage):
    student = await create_student(teacher)
    async with learner(teacher, student, test_settings, storage) as (client, token, login):
        used = await client.post(
            "/api/student/activate", json={"token": token, "password": PASSWORD}
        )
        assert used.status_code == 400
        assert (await client.get("/api/student/session")).json()["login"] == login
        old_csrf = client.headers.pop("X-CSRF-Token")
        assert (await client.post("/api/student/logout")).status_code == 403
        client.headers["X-CSRF-Token"] = old_csrf
        new_invitation = await teacher.post(f"/api/students/{student}/invitation")
        assert new_invitation.status_code == 200
        assert (await client.get("/api/student/session")).status_code == 401
        assert (
            await client.post("/api/student/login", json={"login": login, "password": PASSWORD})
        ).status_code == 401
        token = new_invitation.json()["url"].split("#")[1]
        activated = await client.post(
            "/api/student/activate", json={"token": token, "password": "replacement pass 123"}
        )
        assert activated.status_code == 200
        assert activated.json()["login"] == login
        assert (
            await client.post(
                "/api/student/login", json={"login": login, "password": "replacement pass 123"}
            )
        ).status_code == 200


async def test_isolation_published_projection_and_knowledge(
    teacher, other_teacher, test_settings, storage
):
    student = await create_student(teacher)
    sibling = await create_student(teacher)
    foreign_student = await create_student(other_teacher)
    homework = await assign(teacher, await create_homework(teacher), [student])
    sibling_hw = await assign(teacher, await create_homework(teacher), [sibling])
    foreign_hw = await assign(
        other_teacher, await create_homework(other_teacher), [foreign_student]
    )
    sibling_work = (
        await send_submission(teacher, sibling_hw["assignments"][0]["id"], sibling_hw["tasks"])
    ).json()
    async with learner(teacher, student, test_settings, storage) as (client, _, _):
        for path in [
            "/api/state",
            "/api/homework",
            "/api/works/" + sibling_work["id"],
            "/api/files/" + sibling_work["attachments"][0]["id"],
            "/api/materials?work_id=" + sibling_work["id"],
        ]:
            assert (await client.get(path)).status_code == 403
        assert (
            await client.get("/api/student/files/" + sibling_work["attachments"][0]["id"])
        ).status_code == 404
        assert (
            await send_submission(
                client, sibling_hw["assignments"][0]["id"], sibling_hw["tasks"], student=True
            )
        ).status_code == 404
        assert (await other_teacher.get(f"/api/homework/{homework['id']}")).status_code == 404
        assert (
            await send_submission(teacher, foreign_hw["assignments"][0]["id"], foreign_hw["tasks"])
        ).status_code == 404
        response = await send_submission(
            client, homework["assignments"][0]["id"], homework["tasks"], student=True
        )
        assert response.status_code == 200, response.text
        work_id = response.json()["id"]
        work = (await teacher.get(f"/api/works/{work_id}")).json()
        assert (
            await client.get("/api/student/files/" + work["attachments"][0]["id"])
        ).status_code == 200
        state = (await client.get("/api/student/state")).json()
        assert [item["id"] for item in state["assignments"]] == [homework["assignments"][0]["id"]]
        assert state["submissions"][0]["result"] is None
        assert "draft" not in str(state)
        await publish_submission(teacher, work, gap_decision="hypothesis")
        state = (await client.get("/api/student/state")).json()
        assert state["submissions"][0]["result"]["tasks"][0]["gap"] is None
        assert state["knowledge"] == []
        assert (await client.get(f"/api/works/{work_id}/report")).status_code == 403
        await act(teacher, work_id, "edit")
        edited = (await teacher.get(f"/api/works/{work_id}")).json()
        await publish_submission(teacher, edited, gap_decision="confirmed")
        state = (await client.get("/api/student/state")).json()
        assert state["knowledge"][0]["topicId"] == "fractions"
        assert "hypothesis" not in str(state)
        assert "initialAnalysis" not in str(state)


async def test_student_readonly_after_teacher_subscription_expires(
    teacher, sessions, test_settings, storage
):
    student = await create_student(teacher)
    homework = await assign(teacher, await create_homework(teacher), [student])
    async with learner(teacher, student, test_settings, storage) as (client, _, _):
        await end_all_subscriptions(sessions)
        assert (await client.get("/api/student/session")).json()["writable"] is False
        assert (await client.get("/api/student/state")).status_code == 200
        assert (
            await send_submission(
                client, homework["assignments"][0]["id"], homework["tasks"], student=True
            )
        ).status_code == 402
        assert (await client.get(f"/api/student/files/{uuid4()}")).status_code == 404
