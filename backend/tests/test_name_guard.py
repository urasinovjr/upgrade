import json
from pathlib import Path

import pytest

from app.analysis.contract import ReviewTask, StepInput
from app.analysis.name_forms import NAME_GROUPS
from app.analysis.names import hide_names, mentions, name_forms_payload, name_places
from app.works.review import initial_draft
from app.works.schemas import Task
from tests.fakes import FakeDraftProvider
from tests.students import create_student
from tests.test_analysis import run_next_job, stored_runs
from tests.works import act, checked_work, task

pytestmark = pytest.mark.prd(15)


def step(step_id: str, latex: str) -> dict:
    return {"id": step_id, "latex": latex, "verdict": "uncertain", "explanation": ""}


CASES_FILE = Path(__file__).resolve().parents[2] / "frontend/src/domain/nameGuardCases.json"
CASES = json.loads(CASES_FILE.read_text("utf-8"))
FRONTEND_FORMS = Path(__file__).resolve().parents[2] / "frontend/src/data/nameForms.json"


@pytest.mark.parametrize("case", CASES, ids=[case["text"] for case in CASES])
def test_name_is_found_in_its_forms(case):
    assert mentions(case["names"], case["text"]) is case["found"]


def test_frontend_copy_of_the_name_forms_is_current():
    assert json.loads(FRONTEND_FORMS.read_text("utf-8")) == name_forms_payload()


def test_every_name_group_is_unique_and_long_enough():
    names = [group[0] for group in NAME_GROUPS]
    assert len(names) == len(set(names))
    assert len(names) >= 120
    assert all(len(group) >= 2 for group in NAME_GROUPS)


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

    assert name_places(["Иван Сидоров"], draft.tasks) == [
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

    [hidden] = hide_names([source], ["Иван Петров"])

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


async def test_analysis_is_refused_for_a_form_from_the_card_or_in_latin(teacher):
    student_id = await create_student(teacher, name="Дарья Иванова", aliases=["Дашуня"])
    tasks = [
        task("t1", condition="Дашуня, решите x+1=2"),
        task("t2", formula="\\text{Ivanova}: x=1"),
        task("t3", condition="Дано: max(a, b) = 3"),
    ]
    work = await checked_work(teacher, student_id, tasks=tasks)

    response = await teacher.post(f"/api/works/{work['id']}/actions/analyse")

    assert response.status_code == 409
    assert response.json()["places"] == [
        {"taskId": "t1", "field": "condition"},
        {"taskId": "t2", "field": "formula"},
    ]


async def test_name_read_from_the_page_is_hidden_from_the_review_call(
    teacher, sessions, test_settings, storage
):
    student_id = await create_student(teacher, name="Иван Петров", aliases=["Ванюшка"])
    work = await checked_work(teacher, student_id)
    assert (await act(teacher, work["id"], "analyse")).status_code == 200
    provider = FakeDraftProvider(latex="\\text{Петров, Ванюшка, Vanya} x=2")

    await run_next_job(sessions, test_settings, storage, provider)
    [run] = await stored_runs(sessions, work["id"])
    [[sent]] = provider.reviewed

    assert sent.steps[0].latex == "\\text{[скрыто], [скрыто], [скрыто]} x=2"
    assert "Петров" not in json.dumps(run.input["review"], ensure_ascii=False)
    assert "Ванюшка" not in json.dumps(run.input["review"], ensure_ascii=False)
