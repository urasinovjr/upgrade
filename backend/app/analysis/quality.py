from collections.abc import Awaitable, Callable
from contextvars import ContextVar

from pydantic import ValidationError

from app.analysis.contract import (
    InvalidReply,
    Recognition,
    RecognizedStep,
    RecognizedTask,
    Review,
    ReviewedStep,
    ReviewedTask,
    ReviewTask,
    check_reviewed_task,
)
from app.provider import ProviderError

retry_context: ContextVar[dict | None] = ContextVar("quality_retry", default=None)

RETRY_REASONS = {
    "incomplete_recognition": "Распознавание неполное: сверьте все строки и продолжение ответа.",
    "task_ids": "Ответ ИИ содержит несогласованные номера задач. Сверьте разбор с оригиналом.",
    "step_ids": "Ответ ИИ содержит несогласованные номера шагов. Сверьте вердикты с оригиналом.",
    "page_ids": "Привязка шагов к страницам расходится с файлами задания. Сверьте шаги вручную.",
    "gap_conflict": "Вердикт и обоснование пробела противоречат друг другу. Сверьте гипотезу.",
    "schema": "Ответ ИИ повреждён. Доступные строки сохранены для ручной сверки.",
}

WARNINGS = {
    "incomplete_recognition": "Распознаны не все строки. Сверьте решение и продолжение ответа",
    "task_ids": "Номера задач в ответе ИИ не совпадают с заданием. Сверьте разбор с оригиналом",
    "step_ids": "Номера шагов в ответе ИИ не совпадают с решением. Сверьте вердикты с оригиналом",
    "page_ids": "Шаги привязаны к другим страницам. Сверьте их с оригиналом вручную",
    "gap_conflict": "Вердикт и обоснование пробела противоречат друг другу. Сверьте гипотезу",
    "schema": "Ответ ИИ повреждён. Сверьте сохранённые строки с оригиналом вручную",
}


def recognition_problem(recognition: Recognition, tasks=None, pages=None) -> None:
    problems = [
        item.task_id for item in recognition.tasks if item.complete is not True or item.issues
    ]
    if problems:
        raise InvalidReply("incomplete_recognition", problems)
    if tasks is None or pages is None:
        return
    allowed = {task.id: task.solution_file_ids for task in tasks}
    problems = [
        task.task_id
        for task in recognition.tasks
        if any(
            step.page is not None
            and (
                not 0 <= step.page < len(pages)
                or (
                    allowed[task.task_id] is not None
                    and pages[step.page].file_id not in allowed[task.task_id]
                )
            )
            for step in task.steps
        )
    ]
    if problems:
        raise InvalidReply("page_ids", problems)


def review_problem(review: Review, tasks: list[ReviewTask]) -> None:
    sources = {task.id: task for task in tasks}
    for item in review.tasks:
        source = sources[item.task_id]
        errors = {step.id for step in item.steps if step.verdict == "error"}
        readable = {step.id for step in source.steps if step.legible}
        substantive = bool(errors & readable) and item.supported
        if (
            not item.gap_reason.strip()
            or item.gap_assessment is None
            or (item.gap_assessment == "proposed") != (item.gap is not None)
            or (item.gap is not None and not substantive)
            or (item.gap_assessment == "insufficient_data" and substantive)
        ):
            raise InvalidReply("gap_conflict", [item.task_id])
        previous_errors = set()
        for step in item.steps:
            if step.consequence_of is not None and (
                step.consequence_of not in previous_errors or step.verdict != "correct"
            ):
                raise InvalidReply("gap_conflict", [item.task_id])
            if step.verdict == "error":
                previous_errors.add(step.id)


def warning(reason: str) -> str:
    return WARNINGS.get(reason, "Разбор не прошёл проверку качества. Сверьте задачу вручную")


def retry_reason(reason: str) -> str:
    return RETRY_REASONS.get(reason, "Разбор не прошёл проверку качества. Сверьте задачу вручную.")


async def stage_reply(
    name: str,
    call: Callable[[], Awaitable],
    read: Callable,
    check: Callable,
    record,
    checkpoint: Callable[[], Awaitable[None]],
):
    state = record.input.setdefault("quality", {"retry_used": False, "responses": [], "issues": []})
    cached = [item for item in state["responses"] if item["stage"] == name]
    while True:
        if cached:
            response = cached[-1]
            cached = []
        else:
            await checkpoint()
            correction = (
                {"stage": name, "reason": state["retry_reason"]}
                if state.get("retry_stage") == name
                else None
            )
            token = retry_context.set(correction)
            failure = None
            try:
                try:
                    reply = await call()
                except ProviderError as error:
                    if error.code != "provider_invalid_response" or error.reply is None:
                        raise
                    reply = error.reply
                    failure = error.code
            finally:
                retry_context.reset(token)
            record.note(reply)
            response = {"stage": name, "raw": reply.raw, "call": len(record.provider_calls) - 1}
            if failure:
                response["error"] = failure
                record.provider_calls[-1]["error"] = failure
            state["responses"].append(response)
            setattr(record, name, reply.raw)
            await checkpoint()
        try:
            if response.get("error"):
                raise InvalidReply("schema")
            parsed = read(response["raw"])
            check(parsed)
            return parsed, []
        except InvalidReply as error:
            response["problem"] = error.reason
            if state["retry_used"]:
                state["issues"].append(
                    {"stage": name, "reason": error.reason, "task_ids": error.task_ids}
                )
                await checkpoint()
                return None, [{"task_ids": error.task_ids, "message": warning(error.reason)}]
            state["retry_used"] = True
            state["retry_stage"] = name
            state["retry_reason"] = error.reason
            await checkpoint()


def recover_recognition(raw: dict | None, tasks: list) -> Recognition:
    found = {}
    items = raw.get("tasks") if isinstance(raw, dict) else None
    for item in items if isinstance(items, list) else []:
        try:
            parsed = RecognizedTask.model_validate(item)
        except ValidationError:
            if not isinstance(item, dict) or not isinstance(item.get("task_id"), str):
                continue
            steps = []
            values = item.get("steps")
            for step in values[:200] if isinstance(values, list) else []:
                try:
                    steps.append(RecognizedStep.model_validate(step))
                except ValidationError:
                    if isinstance(step, dict) and isinstance(step.get("latex"), str):
                        steps.append(RecognizedStep(latex=step["latex"][:5000], legible=False))
            parsed = RecognizedTask(
                task_id=item["task_id"],
                matched=item.get("matched") is True,
                steps=steps,
                complete=False,
                issues=["Часть ответа повреждена. Сверьте сохранённые строки"],
            )
        found.setdefault(parsed.task_id, parsed)
    return Recognition(
        tasks=[
            found.get(task.id, RecognizedTask(task_id=task.id, matched=False, steps=[]))
            for task in tasks
        ]
    )


def recover_review(raw: dict | None, tasks: list[ReviewTask]) -> Review:
    found = {}
    items = raw.get("tasks") if isinstance(raw, dict) else None
    for item in items if isinstance(items, list) else []:
        try:
            parsed = ReviewedTask.model_validate(item)
        except ValidationError:
            continue
        found.setdefault(parsed.task_id, parsed)
    recovered = []
    for task in tasks:
        item = found.get(task.id)
        if item is not None:
            try:
                check_reviewed_task(item, [step.id for step in task.steps])
                review_problem(Review(tasks=[item]), [task])
            except InvalidReply:
                item = None
        if item is None:
            item = ReviewedTask(
                task_id=task.id,
                supported=True,
                topic_id="",
                steps=[
                    ReviewedStep(
                        id=step.id, verdict="uncertain", explanation="Сверьте с оригиналом"
                    )
                    for step in task.steps
                ],
                feedback="Сверьте решение с оригиналом и завершите проверку вручную",
            )
        recovered.append(item)
    return Review(tasks=recovered)
