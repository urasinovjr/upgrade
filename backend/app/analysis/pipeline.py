import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from decimal import Decimal

from pydantic import ValidationError

from app.analysis.contract import (
    DraftProvider,
    InvalidReply,
    ProviderReply,
    read_recognition,
    read_review,
)
from app.analysis.drafting import (
    condition_images,
    condition_record,
    merge_review,
    page_crops,
    review_tasks,
    task_input,
    tasks_to_recognize,
)
from app.analysis.names import hide_names
from app.analysis.quality import (
    recognition_problem,
    recover_recognition,
    recover_review,
    review_problem,
    stage_reply,
)
from app.analysis.variants import Variant
from app.config import Settings
from app.knowledge.catalog import CATALOG_VERSION
from app.redaction import SanitizedPages
from app.works.schemas import Draft
from app.works.service import draft_too_large, dump


@dataclass
class AnalysisSource:
    input_revision: int
    draft: Draft
    sanitized: SanitizedPages
    sanitize_ms: int
    layout: list[dict]
    last_layout: list[dict] | None
    student_names: list[str] = field(default_factory=list)


@dataclass
class RunRecord:
    input: dict = field(default_factory=dict)
    recognized: bool = False
    provider: str = ""
    model: str = ""
    prompt_version: str = ""
    recognition: dict | None = None
    review: dict | None = None
    draft: dict | None = None
    recognize_ms: int | None = None
    review_ms: int | None = None
    request_id: str | None = None
    queued_ms: int | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    cost: Decimal = Decimal(0)
    cost_currency: str = ""
    sanitize_ms: int | None = None
    sent_pages: list = field(default_factory=list)
    variant: str = ""
    code_commit: str = ""
    catalog_version: str = CATALOG_VERSION
    provider_calls: list[dict] = field(default_factory=list)
    actual_cost_usd: Decimal | None = None

    def note(self, reply: ProviderReply) -> None:
        self.provider = reply.provider
        self.model = reply.model
        self.prompt_version = reply.prompt_version
        self.input_tokens += reply.input_tokens
        self.output_tokens += reply.output_tokens
        self.provider_calls.append(reply.call_metadata())
        costs = [call["actual_cost_usd"] for call in self.provider_calls]
        self.actual_cost_usd = (
            sum((Decimal(cost) for cost in costs), Decimal(0))
            if all(cost is not None for cost in costs)
            else None
        )

    def price(self, variant: Variant) -> None:
        tokens_cost = (
            self.input_tokens * variant.price_input_per_mtok
            + self.output_tokens * variant.price_output_per_mtok
        )
        self.cost = tokens_cost / 1_000_000
        self.cost_currency = variant.currency


def elapsed_ms(started: float) -> int:
    return round((time.monotonic() - started) * 1000)


def checked_draft(draft: Draft, settings: Settings) -> Draft:
    try:
        draft = Draft.model_validate(dump(draft))
    except ValidationError as error:
        raise InvalidReply("draft_limits") from error
    if draft_too_large(draft, settings):
        raise InvalidReply("draft_size")
    return draft


async def build_draft(
    provider: DraftProvider,
    source: AnalysisSource,
    settings: Settings,
    record: RunRecord,
    checkpoint: Callable[[], Awaitable[None]] | None = None,
) -> Draft:
    async def persist():
        if checkpoint is not None:
            await checkpoint()

    version = getattr(getattr(provider, "variant", None), "prompt_version", "")
    quality = version == "math-4"
    warnings = []
    record.sanitize_ms = source.sanitize_ms
    record.sent_pages = source.sanitized.sent
    targets = tasks_to_recognize(source.draft, source.layout, source.last_layout)
    crops = page_crops(source.layout)
    record.input.update(
        {
            "layout": source.layout,
            "tasks": [task_input(task, crops).model_dump() for task in source.draft.tasks],
            "recognize": [task.id for task in targets],
        }
    )
    recognition = None
    if targets:
        inputs = [task_input(task, crops) for task in targets]
        started = time.monotonic()
        if quality:
            recognition, issues = await stage_reply(
                "recognition",
                lambda: provider.recognize(source.sanitized.pages, inputs),
                lambda raw: read_recognition(raw, inputs),
                lambda parsed: recognition_problem(parsed, inputs, source.sanitized.pages),
                record,
                persist,
            )
            if recognition is None:
                recognition = recover_recognition(record.recognition, inputs)
            warnings += issues
        else:
            reply = await provider.recognize(source.sanitized.pages, inputs)
            record.note(reply)
            record.recognition = reply.raw
            recognition = read_recognition(reply.raw, inputs)
        record.recognize_ms = elapsed_ms(started)
        record.recognized = True
    tasks, origins = review_tasks(source.draft, recognition, source.sanitized.pages, source.layout)
    sent = hide_names(tasks, source.student_names)
    conditions = condition_images(source.draft, source.sanitized.pages, source.layout)
    if version in {"math-3", "math-4"}:
        from app.analysis.contract import ConditionImage

        for task in source.draft.tasks:
            solution_ids = task.solution_attachment_ids
            condition_ids = set(task.condition_attachment_ids or [])
            for page in source.sanitized.pages:
                is_solution = (
                    page.file_id in solution_ids
                    if solution_ids is not None
                    else page.file_id not in condition_ids
                )
                if is_solution:
                    conditions.append(ConditionImage(task_id=task.id, image=page, kind="solution"))
    record.input["review"] = [task.model_dump() for task in sent]
    record.input["reviewConditions"] = condition_record(conditions)
    started = time.monotonic()
    if quality:
        review, issues = await stage_reply(
            "review",
            lambda: provider.review(sent, conditions),
            lambda raw: read_review(raw, sent),
            lambda parsed: review_problem(parsed, sent),
            record,
            persist,
        )
        if review is None:
            review = recover_review(record.review, sent)
        warnings += issues
    else:
        reply = await provider.review(sent, conditions)
        record.note(reply)
        record.review = reply.raw
        review = read_review(reply.raw, sent)
    record.review_ms = elapsed_ms(started)
    draft = checked_draft(merge_review(source.draft, tasks, review, origins), settings)
    if quality:
        recognized = {item.task_id: item for item in recognition.tasks} if recognition else {}
        for task in draft.tasks:
            item = recognized.get(task.id)
            task.quality_warnings = [
                item["message"]
                for item in warnings
                if not item["task_ids"] or task.id in item["task_ids"]
            ]
            if item is not None and (item.complete is not True or item.issues):
                task.quality_warnings += item.issues
            task.quality_warnings = task.quality_warnings[:50]
            if task.quality_warnings:
                task.reviewed = False
                task.gap = None
    record.draft = dump(draft)
    return checked_draft(draft, settings)
