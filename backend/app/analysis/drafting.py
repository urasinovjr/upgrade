from uuid import uuid4

from app.analysis.contract import (
    Recognition,
    RecognizedTask,
    Review,
    ReviewedStep,
    ReviewedTask,
    ReviewTask,
    StepInput,
    TaskInput,
)
from app.works.models import WorkFile
from app.works.schemas import Draft, GapProposal, Step, Task


def layout_signature(files: list[WorkFile]) -> list[dict]:
    return [
        {"id": str(file.id), "pageOrder": file.page_order, "crops": file.crops} for file in files
    ]


def has_steps(task: Task) -> bool:
    return bool(task.steps) and all(step.latex.strip() for step in task.steps)


def tasks_to_recognize(
    draft: Draft, layout: list[dict], last_layout: list[dict] | None
) -> list[Task]:
    if layout != last_layout:
        return list(draft.tasks)
    return [task for task in draft.tasks if not has_steps(task)]


def task_input(task: Task) -> TaskInput:
    return TaskInput(
        id=task.id,
        condition=task.condition,
        formula=task.formula,
        reference=task.reference,
        condition_file_ids=task.condition_attachment_ids or [],
    )


def recognized_steps(item: RecognizedTask) -> list[StepInput]:
    if not item.matched:
        return []
    return [
        StepInput(id=str(uuid4()), latex=step.latex, legible=step.legible) for step in item.steps
    ]


def review_tasks(draft: Draft, recognition: Recognition | None) -> list[ReviewTask]:
    recognized = {item.task_id: item for item in recognition.tasks} if recognition else {}
    result = []
    for task in draft.tasks:
        if task.id in recognized:
            steps = recognized_steps(recognized[task.id])
        else:
            steps = [StepInput(id=step.id, latex=step.latex, legible=True) for step in task.steps]
        result.append(ReviewTask(**task_input(task).model_dump(), steps=steps))
    return result


def merged_step(step: StepInput, reviewed: ReviewedStep | None) -> Step:
    explanation = reviewed.explanation if reviewed else ""
    if reviewed is None or not step.legible:
        return Step(id=step.id, latex=step.latex, verdict="uncertain", explanation=explanation)
    return Step(id=step.id, latex=step.latex, verdict=reviewed.verdict, explanation=explanation)


def merged_task(task: Task, source: ReviewTask, item: ReviewedTask) -> Task:
    reviewed = {step.id: step for step in item.steps}
    gap = None
    if item.gap is not None:
        gap = GapProposal(topic_id=item.gap.topic_id, reason=item.gap.reason, decision="hypothesis")
    return task.model_copy(
        update={
            "steps": [merged_step(step, reviewed.get(step.id)) for step in source.steps],
            "topic_id": item.topic_id,
            "gap": gap,
            "feedback": item.feedback if item.supported else item.reason,
            "omitted": not item.supported,
            "reviewed": False,
        }
    )


def merge_review(draft: Draft, tasks: list[ReviewTask], review: Review) -> Draft:
    sources = {task.id: task for task in tasks}
    reviewed = {item.task_id: item for item in review.tasks}
    merged = draft.model_copy(deep=True)
    merged.tasks = [merged_task(task, sources[task.id], reviewed[task.id]) for task in merged.tasks]
    merged.revision += 1
    merged.analysed_input_revision = merged.input_revision
    return merged
