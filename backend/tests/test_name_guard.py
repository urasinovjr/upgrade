import json

import pytest

from app.analysis.contract import ReviewTask, StepInput
from app.analysis.names import hide_names, mentions, name_places
from app.works.review import initial_draft
from app.works.schemas import Task
from tests.fakes import FakeDraftProvider
from tests.students import create_student
from tests.test_analysis import run_next_job, stored_runs
from tests.works import act, checked_work, task

pytestmark = pytest.mark.prd(15)


def step(step_id: str, latex: str) -> dict:
    return {"id": step_id, "latex": latex, "verdict": "uncertain", "explanation": ""}


CASES = [
    ("Иван Петров", "Ответ Ивану: x=2", True),
    ("Иван Петров", "Работа Иваном сдана", True),
    ("Мария Иванова", "Проверила Ивановой", True),
    ("Мария", "Задача Марии", True),
    ("Мария", "марка и маринад", False),
    ("Пётр", "петр решил", True),
    ("Петя", "петля функции", False),
    ("Аня", "Ани нет", False),
    ("Ян", "Ян решил", False),
    ("Иван", "\\text{Иван}: x^2=4", True),
    ("Иван", "Ивановский округ", False),
    ("", "Иван", False),
]


@pytest.mark.parametrize(("name", "text", "expected"), CASES)
def test_name_is_found_in_its_forms(name, text, expected):
    assert mentions(name, text) is expected


def test_places_point_to_task_field_and_step():
    draft = initial_draft(
        [
            Task.model_validate(task("t1", condition="Иван, решите уравнение")),
            Task.model_validate(
                task(
                    "t2",
                    condition="Решите",
                    steps=[
                        {"id": "a", "latex": "x=1", "verdict": "uncertain", "explanation": ""},
                        {
                            "id": "b",
                            "latex": "Ивану: x=2",
                            "verdict": "uncertain",
                            "explanation": "",
                        },
                    ],
                )
            ),
        ]
    )

    assert name_places("Иван Сидоров", draft.tasks) == [
        {"taskId": "t1", "field": "condition"},
        {"taskId": "t2", "field": "step", "stepId": "b"},
    ]


def test_hidden_copy_keeps_ids_and_drops_the_name():
    source = ReviewTask(
        id="t1",
        condition="Решите, Иван",
        formula="",
        reference="",
        condition_file_ids=[],
        steps=[StepInput(id="s1", latex="\\text{Ивану} x=2", legible=True)],
    )

    [hidden] = hide_names([source], "Иван Петров")

    assert hidden.condition == "Решите, [скрыто]"
    assert hidden.steps[0].latex == "\\text{[скрыто]} x=2"
    assert hidden.steps[0].id == "s1"
    assert source.condition == "Решите, Иван"


async def test_analysis_is_refused_while_the_name_is_in_the_text(teacher):
    student_id = await create_student(teacher, name="Иван Петров")
    work = await checked_work(
        teacher, student_id, tasks=[task("t1", condition="Иван, решите x+1=2")]
    )

    response = await teacher.post(f"/api/works/{work['id']}/actions/analyse")

    assert response.status_code == 409
    assert response.json() == {
        "detail": "name_in_text",
        "places": [{"taskId": "t1", "field": "condition"}],
    }


async def test_name_read_from_the_page_is_hidden_from_the_review_call(
    teacher, sessions, test_settings, storage
):
    student_id = await create_student(teacher, name="Иван Петров")
    work = await checked_work(teacher, student_id)
    assert (await act(teacher, work["id"], "analyse")).status_code == 200
    provider = FakeDraftProvider(latex="\\text{Петров} x=2")

    await run_next_job(sessions, test_settings, storage, provider)
    [run] = await stored_runs(sessions, work["id"])
    [[sent]] = provider.reviewed

    assert sent.steps[0].latex == "\\text{[скрыто]} x=2"
    assert "Петров" not in json.dumps(run.input["review"], ensure_ascii=False)
