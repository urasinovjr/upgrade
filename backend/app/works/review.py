from app.works.schemas import Draft, Task


def task_signature(task: Task) -> dict:
    return {
        "id": task.id,
        "condition": task.condition,
        "condition_attachment_ids": task.condition_attachment_ids,
        "formula": task.formula,
        "reference": task.reference,
        "steps": [{"id": step.id, "latex": step.latex} for step in task.steps],
    }


def input_signature(draft: Draft) -> list[dict]:
    return [task_signature(task) for task in draft.tasks]


def keep_step_origins(stored: Draft, draft: Draft) -> None:
    origins = {step.id: step.origin for task in stored.tasks for step in task.steps}
    for task in draft.tasks:
        for step in task.steps:
            if step.origin is not None:
                step.origin = origins.get(step.id)


def apply_draft(stored: Draft, proposed: Draft) -> Draft:
    changed_inputs = input_signature(stored) != input_signature(proposed)
    draft = proposed.model_copy(deep=True)
    keep_step_origins(stored, draft)
    draft.revision = stored.revision + 1
    draft.input_revision = stored.input_revision + (1 if changed_inputs else 0)
    draft.analysed_input_revision = stored.analysed_input_revision
    if changed_inputs:
        before = {task.id: task for task in stored.tasks}
        for task in draft.tasks:
            previous = before.get(task.id)
            if previous is None or task_signature(previous) != task_signature(task):
                task.reviewed = False
    return draft


def keep_known_attachments(draft: Draft, attachment_ids: set[str]) -> Draft:
    for task in draft.tasks:
        if task.condition_attachment_ids is not None:
            task.condition_attachment_ids = [
                item for item in task.condition_attachment_ids if item in attachment_ids
            ]
    return draft


def task_problems(task: Task, attachment_ids: set[str]) -> list[str]:
    if task.omitted:
        if not task.feedback.strip():
            return [f"{task.title}: напишите, почему задача отложена."]
        return []
    problems = []
    has_file = any(item in attachment_ids for item in task.condition_attachment_ids or [])
    if not task.condition.strip() and not task.formula.strip() and not has_file:
        problems.append(f"{task.title}: добавьте условие.")
    if not task.steps or any(not step.latex.strip() for step in task.steps):
        problems.append(f"{task.title}: добавьте шаги решения.")
    if any(step.verdict == "uncertain" for step in task.steps):
        problems.append(f"{task.title}: уточните неясные шаги.")
    if any(step.verdict == "error" and not step.explanation.strip() for step in task.steps):
        problems.append(f"{task.title}: объясните ошибку.")
    if task.gap is not None and task.gap.decision == "confirmed" and not task.gap.reason.strip():
        problems.append(f"{task.title}: напишите, что повторить.")
    if not task.reviewed:
        problems.append(f"{task.title}: отметьте задачу проверенной.")
    return problems


def review_blockers(
    status: str, editing: bool, has_job: bool, draft: Draft, attachment_ids: set[str]
) -> list[str]:
    if not editing:
        return []
    if has_job:
        return ["ИИ ещё разбирает работу."]
    blockers = []
    if status != "ready":
        blockers.append("Дождитесь разбора или сверьте работу с оригиналом вручную.")
    if draft.input_revision != draft.analysed_input_revision:
        blockers.append("Условия или шаги изменились. Запустите разбор заново.")
    if not draft.tasks:
        blockers.append("Добавьте хотя бы одну задачу.")
    for task in draft.tasks:
        blockers.extend(task_problems(task, attachment_ids))
    return blockers


def reopened_draft(current: Draft, published: Draft) -> Draft:
    draft = published.model_copy(deep=True)
    draft.revision = current.revision + 1
    for task in draft.tasks:
        task.reviewed = False
    return draft


def initial_draft(tasks: list[Task]) -> Draft:
    draft = Draft(
        revision=1,
        input_revision=0,
        analysed_input_revision=-1,
        tasks=[task.model_copy(deep=True) for task in tasks],
        feedback="",
    )
    for task in draft.tasks:
        for step in task.steps:
            step.origin = None
    return draft
