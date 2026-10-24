import hashlib
from uuid import uuid4

from app.analysis.contract import (
    ConditionArea,
    ConditionImage,
    Recognition,
    RecognizedStep,
    RecognizedTask,
    Region,
    Review,
    ReviewedStep,
    ReviewedTask,
    ReviewTask,
    StepInput,
    TaskInput,
)
from app.knowledge.task_types import OUT_OF_SCOPE_TYPES, TASK_TYPE_NAMES
from app.redaction import PageImage
from app.redaction.condition import crop_page
from app.redaction.geometry import inside_page, to_original, to_sanitized
from app.works.models import WorkFile
from app.works.schemas import CropRect, Draft, GapProposal, Step, StepOrigin, Task

Origins = dict[str, StepOrigin | None]


def layout_signature(files: list[WorkFile]) -> list[dict]:
    return [
        {"id": str(file.id), "pageOrder": file.page_order, "crops": file.crops, "masks": file.masks}
        for file in files
    ]


def has_steps(task: Task) -> bool:
    return bool(task.steps) and all(step.latex.strip() for step in task.steps)


def tasks_to_recognize(
    draft: Draft, layout: list[dict], last_layout: list[dict] | None
) -> list[Task]:
    if layout != last_layout:
        return list(draft.tasks)
    return [task for task in draft.tasks if not has_steps(task)]


def page_crops(layout: list[dict]) -> dict[str, dict]:
    return {item["id"]: item["crops"] for item in layout}


def condition_area(task: Task, crops: dict[str, dict]) -> ConditionArea | None:
    found = task.condition_region
    if found is None:
        return None
    crop = crops.get(found.file_id, {}).get(str(found.page))
    area = to_sanitized(found.region.model_dump(), crop)
    if area is None:
        return None
    return ConditionArea(file_id=found.file_id, page=found.page, region=Region(**area))


def task_input(task: Task, crops: dict[str, dict] | None = None) -> TaskInput:
    return TaskInput(
        id=task.id,
        condition=task.condition,
        formula=task.formula,
        reference=task.reference,
        condition_file_ids=task.condition_attachment_ids or [],
        condition_region=condition_area(task, crops or {}),
    )


def fitted(region: dict) -> CropRect:
    x = round(min(max(region["x"], 0.0), 1.0), 6)
    y = round(min(max(region["y"], 0.0), 1.0), 6)
    width = round(min(region["width"], 1.0 - x), 6)
    height = round(min(region["height"], 1.0 - y), 6)
    return CropRect(x=x, y=y, width=width, height=height)


def origin_of(
    step: RecognizedStep, pages: list[PageImage], crops: dict[str, dict]
) -> StepOrigin | None:
    if step.page is None or step.region is None or not 0 <= step.page < len(pages):
        return None
    region = step.region.model_dump()
    if not inside_page(region):
        return None
    page = pages[step.page]
    mapped = to_original(region, crops.get(page.file_id, {}).get(str(page.page)))
    if mapped["width"] <= 0 or mapped["height"] <= 0:
        return None
    return StepOrigin(
        file_id=page.file_id, page=page.page, region=fitted(mapped), recognized_latex=step.latex
    )


def recognized_steps(
    item: RecognizedTask, pages: list[PageImage], crops: dict[str, dict]
) -> list[tuple[StepInput, StepOrigin | None]]:
    if not item.matched:
        return []
    return [
        (
            StepInput(id=str(uuid4()), latex=step.latex, legible=step.legible),
            origin_of(step, pages, crops),
        )
        for step in item.steps
    ]


def kept_steps(task: Task) -> list[tuple[StepInput, StepOrigin | None]]:
    return [
        (StepInput(id=step.id, latex=step.latex, legible=True), step.origin) for step in task.steps
    ]


def review_tasks(
    draft: Draft,
    recognition: Recognition | None,
    pages: list[PageImage] | None = None,
    layout: list[dict] | None = None,
) -> tuple[list[ReviewTask], Origins]:
    recognized = {item.task_id: item for item in recognition.tasks} if recognition else {}
    crops = page_crops(layout or [])
    result = []
    origins: Origins = {}
    for task in draft.tasks:
        if task.id in recognized:
            pairs = recognized_steps(recognized[task.id], pages or [], crops)
        else:
            pairs = kept_steps(task)
        origins.update({step.id: origin for step, origin in pairs})
        steps = [step for step, _ in pairs]
        result.append(ReviewTask(**task_input(task, crops).model_dump(), steps=steps))
    return result, origins


def region_image(task_id: str, area: ConditionArea, pages: list[PageImage]) -> list:
    found = [page for page in pages if (page.file_id, page.page) == (area.file_id, area.page)]
    return [
        ConditionImage(
            task_id=task_id,
            image=crop_page(page, area.region.model_dump()),
            region=area.region,
        )
        for page in found
    ]


def condition_images(
    draft: Draft, pages: list[PageImage], layout: list[dict] | None = None
) -> list[ConditionImage]:
    crops = page_crops(layout or [])
    images = []
    for task in draft.tasks:
        files = set(task.condition_attachment_ids or [])
        images += [
            ConditionImage(task_id=task.id, image=page) for page in pages if page.file_id in files
        ]
        area = condition_area(task, crops)
        if area is not None:
            images += region_image(task.id, area, pages)
    return images


def condition_record(conditions: list[ConditionImage]) -> list[dict]:
    return [
        {
            "taskId": item.task_id,
            "index": item.image.index,
            "fileId": item.image.file_id,
            "page": item.image.page,
            "sha256": hashlib.sha256(item.image.data).hexdigest(),
            "width": item.image.width,
            "height": item.image.height,
            "region": item.region.model_dump() if item.region else None,
        }
        for item in conditions
    ]


def merged_step(step: StepInput, reviewed: ReviewedStep | None, origin: StepOrigin | None) -> Step:
    explanation = reviewed.explanation if reviewed else ""
    verdict = "uncertain" if reviewed is None or not step.legible else reviewed.verdict
    return Step(
        id=step.id, latex=step.latex, verdict=verdict, explanation=explanation, origin=origin
    )


def out_of_scope_reason(task_type_id: str) -> str:
    return f"UpGrade пока не разбирает такие задачи: {TASK_TYPE_NAMES[task_type_id].lower()}."


def merged_task(task: Task, source: ReviewTask, item: ReviewedTask, origins: Origins) -> Task:
    reviewed = {step.id: step for step in item.steps}
    gap = None
    if item.gap is not None:
        gap = GapProposal(topic_id=item.gap.topic_id, reason=item.gap.reason, decision="hypothesis")
    outside = item.task_type_id in OUT_OF_SCOPE_TYPES
    supported = item.supported and not outside
    reason = out_of_scope_reason(item.task_type_id) if outside else item.reason
    return task.model_copy(
        update={
            "steps": [
                merged_step(step, reviewed.get(step.id), origins.get(step.id))
                for step in source.steps
            ],
            "topic_id": item.topic_id,
            "task_type_id": item.task_type_id,
            "gap": None if outside else gap,
            "feedback": item.feedback if supported else reason,
            "omitted": not supported,
            "reviewed": False,
        }
    )


def merge_review(
    draft: Draft, tasks: list[ReviewTask], review: Review, origins: Origins | None = None
) -> Draft:
    sources = {task.id: task for task in tasks}
    reviewed = {item.task_id: item for item in review.tasks}
    merged = draft.model_copy(deep=True)
    merged.tasks = [
        merged_task(task, sources[task.id], reviewed[task.id], origins or {})
        for task in merged.tasks
    ]
    merged.revision += 1
    merged.analysed_input_revision = merged.input_revision
    return merged
