import pytest

from app.analysis.contract import InvalidReply, Recognition, read_recognition, read_review
from app.analysis.drafting import merge_review, review_tasks, task_input, tasks_to_recognize
from app.works.review import initial_draft
from app.works.schemas import Task
from tests.works import task

LAYOUT = [{"id": "f1", "pageOrder": [1], "crops": {}}]


def draft_of(*tasks: dict):
    return initial_draft([Task.model_validate(item) for item in tasks])


def reviewed(task_id: str = "t1", **changes) -> dict:
    data = {
        "task_id": task_id,
        "supported": True,
        "topic_id": "equations",
        "steps": [],
        "feedback": "Решение верное.",
    }
    return {**data, **changes}


def recognition(*items: dict) -> Recognition:
    return Recognition.model_validate({"tasks": list(items)})


def test_first_analysis_recognizes_every_task():
    draft = draft_of(task("t1"), task("t2"))

    assert [item.id for item in tasks_to_recognize(draft, LAYOUT, None)] == ["t1", "t2"]


def test_same_layout_recognizes_only_tasks_without_steps():
    blank = [{"id": "s1", "latex": " ", "verdict": "uncertain", "explanation": ""}]
    draft = draft_of(task("t1"), task("t2", steps=blank), task("t3", steps=[]))

    assert [item.id for item in tasks_to_recognize(draft, LAYOUT, LAYOUT)] == ["t2", "t3"]


def test_changed_layout_recognizes_every_task_again():
    draft = draft_of(task("t1"))
    moved = [{"id": "f1", "pageOrder": [2, 1], "crops": {}}]

    assert len(tasks_to_recognize(draft, moved, LAYOUT)) == 1


@pytest.mark.prd(1)
def test_review_uses_recognized_steps_and_keeps_teacher_steps_for_the_rest():
    draft = draft_of(task("t1"), task("t2"), task("t3"))
    found = recognition(
        {"task_id": "t1", "matched": True, "steps": [{"latex": "x=2", "legible": False}]},
        {"task_id": "t3", "matched": False, "steps": [{"latex": "x", "legible": True}]},
    )

    tasks, _ = review_tasks(draft, found)

    assert tasks[0].steps[0].id != "s1"
    assert tasks[0].steps[0].legible is False
    assert [(step.id, step.legible) for step in tasks[1].steps] == [("s1", True)]
    assert tasks[2].steps == []


@pytest.mark.prd(11)
def test_merge_replaces_ai_fields_and_keeps_teacher_inputs():
    draft = draft_of(task("t1", condition="Условие", reference="x=2", feedback="старое"))
    draft.feedback = "Общий комментарий"
    tasks, _ = review_tasks(draft, None)
    steps = [{"id": "s1", "verdict": "error", "explanation": "Потерян корень."}]
    gap = {"topic_id": "powers", "reason": "Повторить степени."}
    review = read_review({"tasks": [reviewed(steps=steps, gap=gap, topic_id="roots")]}, tasks)

    merged = merge_review(draft, tasks, review)
    result = merged.tasks[0]

    assert result.condition == "Условие"
    assert result.reference == "x=2"
    assert result.topic_id == "roots"
    assert result.steps[0].verdict == "error"
    assert result.steps[0].explanation == "Потерян корень."
    assert result.gap is not None
    assert (result.gap.topic_id, result.gap.decision) == ("powers", "hypothesis")
    assert result.feedback == "Решение верное."
    assert result.reviewed is False
    assert merged.feedback == "Общий комментарий"
    assert merged.revision == draft.revision + 1
    assert merged.input_revision == draft.input_revision
    assert merged.analysed_input_revision == draft.input_revision


@pytest.mark.prd(5)
def test_unsupported_task_is_omitted_with_reason():
    draft = draft_of(task("t1"))
    tasks, _ = review_tasks(draft, None)
    item = reviewed(supported=False, reason="Задача на производную.")

    merged = merge_review(draft, tasks, read_review({"tasks": [item]}, tasks))

    assert merged.tasks[0].omitted is True
    assert merged.tasks[0].feedback == "Задача на производную."
    assert merged.tasks[0].steps[0].verdict == "uncertain"


def reviewed_as(task_type_id: str, **changes):
    draft = draft_of(task("t1"))
    tasks, _ = review_tasks(draft, None)
    steps = [{"id": tasks[0].steps[0].id, "verdict": "correct", "explanation": ""}]
    item = reviewed(task_type_id=task_type_id, steps=steps, **changes)
    return merge_review(draft, tasks, read_review({"tasks": [item]}, tasks)).tasks[0]


@pytest.mark.prd(5)
def test_derivative_is_supported_and_correct_work_has_no_gap():
    merged = reviewed_as("derivative", gap={"topic_id": "domain", "reason": "ОДЗ"})

    assert (merged.omitted, merged.task_type_id, merged.gap) == (False, "derivative", None)


def test_task_type_in_scope_is_kept():
    merged = reviewed_as("quadratic_eq")

    assert (merged.omitted, merged.task_type_id) == (False, "quadratic_eq")


@pytest.mark.prd(4)
def test_illegible_step_stays_uncertain_whatever_the_verdict():
    draft = draft_of(task("t1"))
    found = recognition(
        {"task_id": "t1", "matched": True, "steps": [{"latex": "?", "legible": False}]}
    )
    tasks, _ = review_tasks(draft, found)
    steps = [{"id": tasks[0].steps[0].id, "verdict": "correct", "explanation": ""}]

    merged = merge_review(draft, tasks, read_review({"tasks": [reviewed(steps=steps)]}, tasks))

    assert merged.tasks[0].steps[0].verdict == "uncertain"


@pytest.mark.prd(1)
def test_recognition_must_cover_exactly_the_requested_tasks():
    draft = draft_of(task("t1"), task("t2"))
    inputs = [task_input(item) for item in draft.tasks]
    found = {"tasks": [{"task_id": "t1", "matched": True, "steps": []}]}

    with pytest.raises(InvalidReply, match="task_ids"):
        read_recognition(found, inputs)


@pytest.mark.parametrize(
    ("item", "reason"),
    [
        (reviewed("t9"), "task_ids"),
        (reviewed(topic_id="geometry"), "topic"),
        (reviewed(task_type_id="calculus"), "task_type"),
        (reviewed(gap={"topic_id": "geometry", "reason": "x"}), "topic"),
        (reviewed(steps=[]), "step_ids"),
        (reviewed(steps=[{"id": "s1", "verdict": "error", "explanation": ""}]), "explanation"),
        (reviewed(supported=False, reason=""), "unsupported_reason"),
        (reviewed(steps="none"), "schema"),
        (reviewed(feedback="x" * 10001), "schema"),
    ],
)
def test_invalid_review_is_rejected(item, reason):
    tasks, _ = review_tasks(draft_of(task("t1")), None)

    with pytest.raises(InvalidReply, match=reason):
        read_review({"tasks": [item]}, tasks)
