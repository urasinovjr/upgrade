from app.works.review import (
    apply_draft,
    initial_draft,
    keep_known_attachments,
    reopened_draft,
    review_blockers,
)
from app.works.schemas import Draft, Task
from tests.works import finished_task, task


def draft_of(*tasks: dict, revision: int = 1) -> Draft:
    return Draft(
        revision=revision,
        input_revision=0,
        analysed_input_revision=0,
        tasks=[Task.model_validate(item) for item in tasks],
        feedback="",
    )


def blockers(draft: Draft, status: str = "ready", files: set[str] | None = None) -> list[str]:
    return review_blockers(status, True, False, draft, files or set())


def test_finished_task_has_no_blockers():
    assert blockers(draft_of(finished_task())) == []


def test_changed_step_needs_new_review_and_analysis():
    stored = draft_of(finished_task())
    proposed = draft_of(finished_task())
    proposed.tasks[0].steps[0].latex = "x=100"

    changed = apply_draft(stored, proposed)

    assert changed.revision == 2
    assert changed.input_revision == 1
    assert changed.tasks[0].reviewed is False
    assert any("обновите разбор" in item for item in blockers(changed))


def test_feedback_edit_keeps_review_and_inputs():
    stored = draft_of(finished_task())
    proposed = draft_of(finished_task())
    proposed.tasks[0].feedback = "Отлично"

    changed = apply_draft(stored, proposed)

    assert changed.input_revision == 0
    assert changed.tasks[0].reviewed is True


def test_only_changed_tasks_lose_review():
    stored = draft_of(finished_task("t1"), finished_task("t2"))
    proposed = draft_of(finished_task("t1"), finished_task("t2"))
    proposed.tasks[1].condition = "Другое условие"

    changed = apply_draft(stored, proposed)

    assert [item.reviewed for item in changed.tasks] == [True, False]


def test_client_counters_are_ignored():
    stored = draft_of(finished_task(), revision=5)
    proposed = draft_of(finished_task(), revision=99)
    proposed.analysed_input_revision = 42

    changed = apply_draft(stored, proposed)

    assert (changed.revision, changed.analysed_input_revision) == (6, 0)


def test_uncertain_failed_and_unexplained_work_is_blocked():
    uncertain = draft_of(task(reviewed=True))
    explained = finished_task()
    explained["steps"][0] = {**explained["steps"][0], "verdict": "error", "explanation": " "}

    assert any("уточните" in item for item in blockers(uncertain))
    assert any("ручную сверку" in item for item in blockers(draft_of(finished_task()), "failed"))
    assert any("объясните ошибку" in item for item in blockers(draft_of(explained)))


def test_condition_can_be_a_file_of_this_work():
    without_text = finished_task()
    without_text.update(condition="", formula="", conditionAttachmentIds=["file-1"])

    assert blockers(draft_of(without_text), files={"file-1"}) == []
    assert any("добавьте условие" in item for item in blockers(draft_of(without_text)))


def test_omitted_task_needs_reason_and_confirmed_gap_needs_advice():
    omitted = task(omitted=True)
    gap = finished_task()
    gap["gap"] = {"topicId": "fractions", "reason": "", "decision": "confirmed"}

    assert any("причину" in item for item in blockers(draft_of(omitted)))
    assert any("рекомендацию" in item for item in blockers(draft_of(gap)))


def test_closed_work_and_running_job():
    draft = draft_of(finished_task())

    assert review_blockers("confirmed", False, False, draft, set()) == []
    assert review_blockers("queued", True, True, draft, set()) == ["Обработка ещё не завершена."]
    assert any("хотя бы одну" in item for item in blockers(draft_of()))


def test_reopened_draft_continues_numbering_and_needs_review():
    current = draft_of(finished_task(), revision=7)
    published = draft_of(finished_task(), revision=3)

    reopened = reopened_draft(current, published)

    assert reopened.revision == 8
    assert reopened.tasks[0].reviewed is False


def test_initial_draft_and_unknown_condition_files():
    draft = initial_draft([Task.model_validate(task(conditionAttachmentIds=["a", "b"]))])

    keep_known_attachments(draft, {"b"})

    assert (draft.revision, draft.input_revision, draft.analysed_input_revision) == (1, 0, -1)
    assert draft.tasks[0].condition_attachment_ids == ["b"]
