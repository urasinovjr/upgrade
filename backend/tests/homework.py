import json
from contextlib import asynccontextmanager
from uuid import uuid4

from tests.accounts import PASSWORD
from tests.conftest import FakeProvider, make_client
from tests.samples import picture
from tests.works import act, save


def homework_task(**changes):
    return {
        "id": str(uuid4()),
        "title": "Задача 1",
        "condition": "Вычислите 1/2 + 1/3",
        "formula": "",
        "topicId": "fractions",
        "taskTypeId": "numeric_fractions",
        "conditionFileIds": [],
        "confirmed": True,
        **changes,
    }


async def create_homework(teacher, tasks=None):
    response = await teacher.put(
        f"/api/homework/{uuid4()}",
        json={
            "title": "Дроби",
            "baseRevision": 0,
            "tasks": tasks or [homework_task()],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


async def assign(teacher, homework, students, deadline=None):
    response = await teacher.post(
        f"/api/homework/{homework['id']}/assign",
        json={
            "studentIds": students,
            "baseRevision": homework["revision"],
            "deadline": deadline,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


async def send_submission(client, assignment_id, tasks, student=False, work_id=None, omit=False):
    file_ids = [] if omit else [str(uuid4()), str(uuid4())]
    data = {
        "id": work_id or str(uuid4()),
        "taskFiles": {
            task["id"]: file_ids if index == 0 else [] for index, task in enumerate(tasks)
        },
    }
    path = "/api/student/assignments" if student else "/api/assignments"
    files = {item: ("solution.png", picture("PNG"), "image/png") for item in file_ids}
    if not files:
        files = {"meta": (None, json.dumps(data))}
        return await client.post(f"{path}/{assignment_id}/submissions", files=files)
    return await client.post(
        f"{path}/{assignment_id}/submissions", data={"meta": json.dumps(data)}, files=files
    )


async def publish_submission(teacher, work, gap_decision="hypothesis"):
    tasks = []
    for index, task in enumerate(work["draft"]["tasks"]):
        tasks.append(
            {
                **task,
                "reviewed": True,
                "feedback": "Повторите общий знаменатель.",
                "steps": [
                    {
                        "id": str(uuid4()),
                        "latex": "1/2 + 1/3 = 2/5",
                        "verdict": "error",
                        "explanation": "Нужно привести к общему знаменателю.",
                    }
                ]
                if not task["omitted"]
                else [],
                "gap": {
                    "topicId": "fractions",
                    "reason": "Сложены знаменатели.",
                    "decision": gap_decision,
                }
                if index == 0 and not task["omitted"]
                else None,
            }
        )
    response = await save(teacher, work, {**work["draft"], "tasks": tasks})
    assert response.status_code == 200, response.text
    response = await save(
        teacher, work, {**work["draft"], "tasks": tasks}, base=response.json()["revision"]
    )
    assert response.status_code == 200, response.text
    response = await act(teacher, work["id"], "manual")
    assert response.status_code == 200, response.text
    response = await act(teacher, work["id"], "confirm")
    assert response.status_code == 200, response.text
    return response.json()


@asynccontextmanager
async def learner(teacher, student_id, settings, storage):
    invitation = await teacher.post(f"/api/students/{student_id}/invitation")
    assert invitation.status_code == 200, invitation.text
    token = invitation.json()["url"].split("#")[1]
    async for client in make_client(settings, FakeProvider(), storage=storage):
        activated = await client.post(
            "/api/student/activate", json={"token": token, "password": PASSWORD}
        )
        assert activated.status_code == 200, activated.text
        client.headers["X-CSRF-Token"] = activated.json()["csrfToken"]
        yield client, token, activated.json()["login"]
