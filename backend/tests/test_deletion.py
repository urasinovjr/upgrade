from sqlalchemy import select, update

from app.files import DELETE_FILES_JOB
from app.queue import Job, claim_job
from app.worker import handle_job
from tests.accounts import PASSWORD, mailed_jobs
from tests.conftest import worker_context
from tests.students import create_student, end_all_subscriptions
from tests.works import confirmed_work, create_work


async def run_cleanup(sessions, settings, storage) -> None:
    async with sessions() as session:
        await session.execute(update(Job).where(Job.kind != DELETE_FILES_JOB).values(status="done"))
        await session.commit()
    while True:
        async with sessions() as session:
            job = await claim_job(session, lease_seconds=5)
        if job is None:
            return
        await handle_job(worker_context(sessions, settings, storage=storage), job)


async def delete_account(client, password: str | None = PASSWORD):
    return await client.request("DELETE", "/api/account", json={"password": password})


async def test_deleted_work_loses_its_files(teacher, sessions, test_settings, storage):
    student_id = await create_student(teacher)
    kept = await create_work(teacher, student_id)
    removed = await confirmed_work(teacher, student_id)

    response = await teacher.delete(f"/api/works/{removed['id']}")
    await run_cleanup(sessions, test_settings, storage)

    assert response.status_code == 204
    assert (await teacher.get(f"/api/works/{removed['id']}")).status_code == 404
    assert [key for key in storage.objects if removed["id"] in key] == []
    assert [key for key in storage.objects if kept["id"] in key] != []


async def test_deleted_student_takes_works_and_closures(teacher, sessions, test_settings, storage):
    student_id = await create_student(teacher)
    other_id = await create_student(teacher, name="Пётр")
    work = await create_work(teacher, student_id)
    await create_work(teacher, other_id)
    await teacher.post(
        f"/api/students/{student_id}/closures",
        json={"topicId": "fractions", "action": "close", "note": "Решила"},
    )

    response = await teacher.delete(f"/api/students/{student_id}")
    await run_cleanup(sessions, test_settings, storage)
    state = (await teacher.get("/api/state")).json()

    assert response.status_code == 204
    assert [item["name"] for item in state["students"]] == ["Пётр"]
    assert [item["studentId"] for item in state["works"]] == [other_id]
    assert state["closures"] == []
    assert [key for key in storage.objects if work["id"] in key] == []


async def test_account_deletion_needs_password(teacher, sessions, test_settings, storage):
    student_id = await create_student(teacher)
    await create_work(teacher, student_id)

    wrong = await delete_account(teacher, "wrong password 1")
    deleted = await delete_account(teacher)
    await run_cleanup(sessions, test_settings, storage)
    login = await teacher.post(
        "/api/auth/login", json={"email": "first@example.com", "password": PASSWORD}
    )

    assert wrong.status_code == 401
    assert deleted.status_code == 204
    assert (await teacher.get("/api/auth/session")).status_code == 401
    assert login.status_code == 401
    assert storage.objects == {}


async def test_account_deletion_drops_pending_letters(teacher, sessions):
    await teacher.post("/api/auth/password-reset/request", json={"email": "first@example.com"})

    await delete_account(teacher)

    assert await mailed_jobs(sessions, "first@example.com", "reset") == []
    async with sessions() as session:
        cleanup = list(await session.scalars(select(Job).where(Job.kind == DELETE_FILES_JOB)))
    assert len(cleanup) == 1


async def test_deletion_works_without_subscription(teacher, sessions):
    student_id = await create_student(teacher)
    work = await create_work(teacher, student_id)
    await end_all_subscriptions(sessions)

    assert (await teacher.delete(f"/api/works/{work['id']}")).status_code == 204
    assert (await teacher.delete(f"/api/students/{student_id}")).status_code == 204
    assert (await delete_account(teacher)).status_code == 204


async def test_other_teacher_cannot_delete(teacher, other_teacher, storage):
    student_id = await create_student(teacher)
    work = await create_work(teacher, student_id)

    responses = [
        await other_teacher.delete(f"/api/works/{work['id']}"),
        await other_teacher.delete(f"/api/students/{student_id}"),
    ]

    assert [response.status_code for response in responses] == [404, 404]
    assert (await teacher.get(f"/api/works/{work['id']}")).status_code == 200
