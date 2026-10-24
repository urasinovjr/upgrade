import pytest

from app.analysis.contract import read_review
from app.analysis.drafting import merge_review, review_tasks
from app.evaluation.auto import summarize, task_row
from app.evaluation.manifest import TaskCard, WorkCard
from app.works.review import initial_draft
from app.works.schemas import Task
from tests.works import task

STEPS = ["x^2-5x+6=0", "D=25+24=49", "x=\\frac{5\\pm 1}{2}", "x_1=3,\\ x_2=2"]


def solved(verdicts: list[str]) -> Task:
    steps = [
        {"id": f"s{index}", "latex": latex, "verdict": "uncertain", "explanation": ""}
        for index, latex in enumerate(STEPS, start=1)
    ]
    draft = initial_draft([Task.model_validate(task("t1", steps=steps))])
    tasks, _ = review_tasks(draft, None)
    reply = {
        "tasks": [
            {
                "task_id": "t1",
                "supported": True,
                "topic_id": "equations",
                "steps": [
                    {
                        "id": step.id,
                        "verdict": verdict,
                        "explanation": "Неверный дискриминант." if verdict == "error" else "",
                    }
                    for step, verdict in zip(tasks[0].steps, verdicts, strict=True)
                ],
            }
        ]
    }
    return merge_review(draft, tasks, read_review(reply, tasks)).tasks[0]


def card(scenario: str, correct: bool, first_error: int | None = None) -> TaskCard:
    return TaskCard(
        task_id="t1",
        family="equations",
        transcription=STEPS,
        correct=correct,
        first_error_step=first_error,
        topic_id="equations",
        scenario=scenario,
    )


WORK = WorkCard(
    work_id="w1",
    split="dev",
    solution_group="w1",
    files=[{"path": "a.png"}],
    tasks=[card("standard", True)],
)


@pytest.mark.prd(2)
def test_accepted_alternative_solution_is_not_a_false_error():
    alternative = card("alternative", True)

    accepted = task_row(WORK, alternative, solved(["correct"] * 4))
    flagged = task_row(WORK, alternative, solved(["correct", "error", "correct", "correct"]))

    assert (accepted["verdictMatch"], accepted["falseError"]) == (True, False)
    assert (flagged["verdictMatch"], flagged["falseError"]) == (False, True)


@pytest.mark.prd(3)
def test_right_answer_after_a_wrong_step_needs_the_first_error():
    tricky = card("right_after_wrong", False, first_error=2)

    caught = task_row(WORK, tricky, solved(["correct", "error", "correct", "correct"]))
    missed = task_row(WORK, tricky, solved(["correct"] * 4))
    late = task_row(WORK, tricky, solved(["correct", "correct", "correct", "error"]))

    assert (caught["verdictMatch"], caught["firstErrorMatch"]) == (True, True)
    assert (missed["verdictMatch"], missed["firstErrorMatch"]) == (False, False)
    assert (late["verdictMatch"], late["firstErrorMatch"]) == (True, False)


@pytest.mark.prd(2, 3)
def test_summary_reports_each_scenario_separately():
    rows = [
        task_row(WORK, card("alternative", True), solved(["correct"] * 4)),
        task_row(
            WORK,
            card("right_after_wrong", False, first_error=2),
            solved(["correct"] * 4),
        ),
    ]

    scenarios = summarize(rows, [])["scenarios"]

    assert scenarios["alternative"]["verdictMatch"] == 1.0
    assert scenarios["right_after_wrong"]["verdictMatch"] == 0.0
