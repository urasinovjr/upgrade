import re
from collections import Counter
from dataclasses import dataclass, field

EDITED_SHARE = 0.5
STEP_KINDS = ("unchanged", "minor", "rewritten", "added", "removed")
GAP_OUTCOMES = ("confirmed", "rejected", "deleted", "undecided", "retopiced")
SPACES = re.compile(r"\s+")


@dataclass
class TaskCorrection:
    task_id: str
    task_type_id: str
    added_task: bool = False
    steps: Counter = field(default_factory=Counter)
    verdicts: Counter = field(default_factory=Counter)
    explanations_edited: int = 0
    topic_changed: bool = False
    type_changed: bool = False
    omitted_change: str = ""
    ai_gap: str = ""
    teacher_gap: bool = False

    @property
    def changed_steps(self) -> int:
        return sum(count for kind, count in self.steps.items() if kind != "unchanged")

    @property
    def total_steps(self) -> int:
        return sum(self.steps.values())

    @property
    def changed_verdicts(self) -> int:
        return sum(count for (before, after), count in self.verdicts.items() if before != after)

    @property
    def total_verdicts(self) -> int:
        return sum(self.verdicts.values())


def compact(latex: str) -> str:
    return SPACES.sub("", latex)


def edit_distance(left: str, right: str) -> int:
    previous = list(range(len(right) + 1))
    for row in range(1, len(left) + 1):
        current = [row]
        for column in range(1, len(right) + 1):
            cost = 0 if left[row - 1] == right[column - 1] else 1
            current.append(
                min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + cost)
            )
        previous = current
    return previous[len(right)]


def changed_share(step: dict) -> float:
    origin = step.get("origin")
    if not origin:
        return 1.0
    before = compact(origin.get("recognizedLatex", ""))
    after = compact(step.get("latex", ""))
    longest = max(len(before), len(after))
    return edit_distance(before, after) / longest if longest else 0.0


def step_kind(step: dict) -> str:
    if not step.get("origin"):
        return "added"
    share = changed_share(step)
    if share == 0:
        return "unchanged"
    return "minor" if share <= EDITED_SHARE else "rewritten"


def gap_outcome(ai_gap: dict | None, final_gap: dict | None) -> str:
    if ai_gap is None:
        return ""
    if final_gap is None:
        return "deleted"
    if final_gap.get("topicId") != ai_gap.get("topicId"):
        return "retopiced"
    return {"confirmed": "confirmed", "rejected": "rejected"}.get(
        final_gap.get("decision", ""), "undecided"
    )


def omitted_change(ai_task: dict, final_task: dict) -> str:
    before = bool(ai_task.get("omitted"))
    after = bool(final_task.get("omitted"))
    if before == after:
        return ""
    return "omitted" if after else "restored"


def added_task_correction(final_task: dict) -> TaskCorrection:
    correction = TaskCorrection(
        task_id=final_task["id"],
        task_type_id=final_task.get("taskTypeId", ""),
        added_task=True,
        teacher_gap=final_task.get("gap") is not None,
    )
    correction.steps["added"] = len(final_task.get("steps", []))
    return correction


def task_correction(ai_task: dict | None, final_task: dict) -> TaskCorrection:
    if ai_task is None:
        return added_task_correction(final_task)
    correction = TaskCorrection(
        task_id=final_task["id"],
        task_type_id=final_task.get("taskTypeId", ""),
        topic_changed=final_task.get("topicId") != ai_task.get("topicId"),
        type_changed=final_task.get("taskTypeId", "") != ai_task.get("taskTypeId", ""),
        omitted_change=omitted_change(ai_task, final_task),
        ai_gap=gap_outcome(ai_task.get("gap"), final_task.get("gap")),
        teacher_gap=ai_task.get("gap") is None and final_task.get("gap") is not None,
    )
    ai_steps = {step["id"]: step for step in ai_task.get("steps", [])}
    final_ids = set()
    for step in final_task.get("steps", []):
        final_ids.add(step["id"])
        correction.steps[step_kind(step)] += 1
        ai_step = ai_steps.get(step["id"])
        if ai_step is None:
            continue
        correction.verdicts[(ai_step.get("verdict"), step.get("verdict"))] += 1
        if step.get("explanation", "") != ai_step.get("explanation", ""):
            correction.explanations_edited += 1
    correction.steps["removed"] = len(set(ai_steps) - final_ids)
    return correction


def draft_corrections(ai_draft: dict, final_draft: dict) -> list[TaskCorrection]:
    ai_tasks = {task["id"]: task for task in ai_draft.get("tasks", [])}
    return [task_correction(ai_tasks.get(task["id"]), task) for task in final_draft["tasks"]]


def edited_manually(ai_draft: dict, final_draft: dict) -> bool:
    return ai_draft.get("analysedInputRevision") != final_draft.get("analysedInputRevision")


def changed_tasks(previous: dict, current: dict) -> int:
    before = {task["id"]: task for task in previous.get("tasks", [])}
    after = {task["id"]: task for task in current.get("tasks", [])}
    ids = before.keys() | after.keys()
    return sum(1 for task_id in ids if before.get(task_id) != after.get(task_id))
