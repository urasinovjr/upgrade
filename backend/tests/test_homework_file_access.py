from tests.homework import assign, create_homework, learner
from tests.samples import picture
from tests.students import create_student


async def test_student_gets_only_confirmed_condition_files(teacher, test_settings, storage):
    student = await create_student(teacher)
    homework = await create_homework(teacher)
    for name in ("condition.png", "unused-private.png"):
        response = await teacher.post(
            f"/api/homework/{homework['id']}/files",
            files={"file": (name, picture("PNG"), "image/png")},
        )
        assert response.status_code == 200
        homework = response.json()
    used = next(file["id"] for file in homework["files"] if file["name"] == "condition.png")
    unused = next(file["id"] for file in homework["files"] if file["name"] == "unused-private.png")
    homework["tasks"][0]["conditionFileIds"] = [used]
    response = await teacher.put(
        f"/api/homework/{homework['id']}",
        json={
            "title": homework["title"],
            "tasks": homework["tasks"],
            "baseRevision": homework["revision"],
            "sourceText": "Текст для подготовки репетитором",
        },
    )
    assert response.status_code == 200
    await assign(teacher, response.json(), [student])
    async with learner(teacher, student, test_settings, storage) as (client, _, _):
        state = (await client.get("/api/student/state")).json()
        assignment = state["assignments"][0]
        assert [file["id"] for file in assignment["files"]] == [used]
        assert (
            not {"sourceText", "recognitionJobId", "provenance", "assignments"} & assignment.keys()
        )
        assert (await client.get(f"/api/student/files/{used}")).status_code == 200
        assert (await client.get(f"/api/student/files/{unused}")).status_code == 404
        assert (await client.get("/api/events")).status_code == 403
