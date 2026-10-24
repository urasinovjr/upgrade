import re
from pathlib import Path

from app.analysis.corrections import (
    EDITED_SHARE,
    changed_share,
    changed_tasks,
    draft_corrections,
    edited_manually,
    gap_outcome,
    step_kind,
)
from app.cli import run
from tests.fakes import FakeDraftProvider
from tests.test_analysis import queued_work, read_work, run_next_job
from tests.works import act, check_all_pages, save

STEP_ORIGIN_TS = Path(__file__).resolve().parents[2] / "frontend/src/domain/stepOrigin.ts"
ORIGIN = {"fileId": "f1", "page": 0, "region": {"x": 0, "y": 0, "width": 1, "height": 1}}


def step(step_id: str, latex: str, recognized: str | None = None, **changes) -> dict:
    data = {"id": step_id, "latex": latex, "verdict": "correct", "explanation": ""}
    if recognized is not None:
        data["origin"] = {**ORIGIN, "recognizedLatex": recognized}
    return {**data, **changes}


def task(task_id: str, steps: list[dict], **changes) -> dict:
    data = {
        "id": task_id,
        "topicId": "equations",
        "taskTypeId": "quadratic_eq",
        "steps": steps,
        "omitted": False,
    }
    return {**data, **changes}


def test_edit_share_matches_the_frontend_rule():
    found = re.search(r"editedShare = ([0-9.]+);", STEP_ORIGIN_TS.read_text("utf-8"))
    assert found is not None
    assert float(found.group(1)) == EDITED_SHARE


def test_step_text_is_compared_with_the_recognized_text():
    assert step_kind(step("s1", "x = 2", "x=2")) == "unchanged"
    assert step_kind(step("s1", "x=-2", "x=2")) == "minor"
    assert step_kind(step("s1", "y^2=9", "x=2")) == "rewritten"
    assert step_kind(step("s1", "x=2")) == "added"
    assert changed_share(step("s1", "", "")) == 0


def test_gap_outcomes_cover_every_teacher_decision():
    proposed = {"topicId": "quadratic", "reason": "", "decision": "hypothesis"}
    assert gap_outcome(None, proposed) == ""
    assert gap_outcome(proposed, None) == "deleted"
    assert gap_outcome(proposed, {**proposed, "decision": "confirmed"}) == "confirmed"
    assert gap_outcome(proposed, {**proposed, "decision": "rejected"}) == "rejected"
    assert gap_outcome(proposed, proposed) == "undecided"
    assert gap_outcome(proposed, {**proposed, "topicId": "fractions"}) == "retopiced"


def test_task_corrections_count_steps_verdicts_and_task_changes():
    gap = {"topicId": "quadratic", "reason": "", "decision": "hypothesis"}
    ai = {
        "analysedInputRevision": 2,
        "tasks": [
            task(
                "t1",
                [
                    step("s1", "x=2", "x=2"),
                    step("s2", "x=3", "x=3", verdict="error", explanation="ИИ"),
                    step("s3", "x=4", "x=4"),
                ],
                gap=gap,
            ),
            task("t2", [step("s4", "a=1", "a=1")]),
        ],
    }
    final = {
        "analysedInputRevision": 2,
        "tasks": [
            task(
                "t1",
                [
                    step("s1", "x=2", "x=2"),
                    step("s2", "x=-3", "x=3", verdict="correct", explanation="Верно"),
                    step("s9", "x=5"),
                ],
                gap={**gap, "decision": "confirmed"},
                topicId="quadratic",
            ),
            task(
                "t2",
                [step("s4", "a=1", "a=1")],
                omitted=True,
                taskTypeId="derivative",
                gap={"topicId": "fractions", "reason": "", "decision": "confirmed"},
            ),
            task("t3", [step("s10", "b=2")]),
        ],
    }

    first, second, added = draft_corrections(ai, final)

    assert dict(first.steps) == {"unchanged": 1, "minor": 1, "added": 1, "removed": 1}
    assert first.changed_steps == 3 and first.total_steps == 4
    assert first.verdicts[("error", "correct")] == 1
    assert first.changed_verdicts == 1 and first.total_verdicts == 2
    assert first.explanations_edited == 1
    assert first.topic_changed and not first.type_changed
    assert first.ai_gap == "confirmed" and not first.teacher_gap
    assert second.type_changed and second.omitted_change == "omitted"
    assert second.ai_gap == "" and second.teacher_gap
    assert added.added_task and added.steps["added"] == 1
    assert not edited_manually(ai, final)
    assert edited_manually(ai, {**final, "analysedInputRevision": 3})


def test_changed_tasks_counts_edited_added_and_removed_tasks():
    before = {"tasks": [task("t1", []), task("t2", [])]}
    after = {"tasks": [task("t1", [], topicId="fractions"), task("t3", [])]}
    assert changed_tasks(before, before) == 0
    assert changed_tasks(before, after) == 3


class ErrorWithGap(FakeDraftProvider):
    async def review(self, tasks, conditions=None):
        reply = await super().review(tasks, conditions)
        for item in reply.raw["tasks"]:
            item["steps"][0]["verdict"] = "error"
            item["steps"][0]["explanation"] = "Потерян корень."
            item["gap"] = {"topic_id": "vieta", "reason": "Корень из квадрата."}
        return reply


async def confirmed_analysed_work(teacher, sessions, settings, storage) -> dict:
    queued = await queued_work(teacher)
    await run_next_job(sessions, settings, storage, ErrorWithGap())
    work = await read_work(teacher, queued["id"])
    first = work["draft"]["tasks"][0]
    steps = [{**first["steps"][0], "verdict": "correct", "explanation": "Всё верно."}]
    gap = {**first["gap"], "decision": "rejected", "reason": "Ученик знает тему."}
    reviewed = {**first, "steps": steps, "gap": gap, "reviewed": True}
    saved = await save(teacher, work, {**work["draft"], "tasks": [reviewed]})
    assert saved.status_code == 200, saved.text
    confirmed = await act(teacher, work["id"], "confirm")
    assert confirmed.status_code == 200, confirmed.text
    return confirmed.json()


async def test_report_counts_corrections_of_the_first_confirmation(
    teacher, sessions, test_settings, storage
):
    work = await confirmed_analysed_work(teacher, sessions, test_settings, storage)

    text = await run(["corrections-report"], test_settings)
    table = await run(["corrections-report", "--csv"], test_settings)
    pilot = await run(["corrections-report", "--pilot"], test_settings)

    assert "Работ с первым подтверждением: 1, задач: 1" in text
    assert "Шаги: без изменений 1" in text
    assert "Вердикты изменены: 1 из 1 (100%)" in text
    assert "ошибка → верно: 1" in text
    assert "Объяснения исправлены: 1" in text
    assert "Гипотезы ИИ о пробелах: 1" in text
    assert "отклонена 1" in text
    assert "fake/fake-model/test-1: задач 1" in text
    rows = table.splitlines()
    assert rows[0].startswith("work_id,teacher_id,task_id,variant,family")
    assert len(rows) == 2 and work["id"] in rows[1] and "error>correct" in rows[1]
    assert pilot == "нет данных"


async def test_report_follows_pilot_participants_and_later_versions(
    teacher, sessions, test_settings, storage
):
    work = await confirmed_analysed_work(teacher, sessions, test_settings, storage)
    await run(["pilot-enroll", "--email", "first@example.com"], test_settings)
    edited = (await act(teacher, work["id"], "edit")).json()
    edited = await check_all_pages(teacher, edited)
    changed_task = {
        **edited["draft"]["tasks"][0],
        "feedback": "Повторите формулу корней.",
        "reviewed": True,
    }
    saved = await save(teacher, edited, {**edited["draft"], "tasks": [changed_task]})
    assert saved.status_code == 200, saved.text
    again = await act(teacher, work["id"], "confirm")
    assert again.status_code == 200, again.text

    text = await run(["corrections-report", "--pilot"], test_settings)

    assert "Работ с первым подтверждением: 1, задач: 1" in text
    assert "Исправлено после публикации: версий 1, задач 1" in text
