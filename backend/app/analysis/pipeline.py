import time
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

    def note(self, reply: ProviderReply) -> None:
        self.provider = reply.provider
        self.model = reply.model
        self.prompt_version = reply.prompt_version
        self.input_tokens += reply.input_tokens
        self.output_tokens += reply.output_tokens

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
    provider: DraftProvider, source: AnalysisSource, settings: Settings, record: RunRecord
) -> Draft:
    record.sanitize_ms = source.sanitize_ms
    record.sent_pages = source.sanitized.sent
    targets = tasks_to_recognize(source.draft, source.layout, source.last_layout)
    crops = page_crops(source.layout)
    record.input = {
        "layout": source.layout,
        "tasks": [task_input(task, crops).model_dump() for task in source.draft.tasks],
        "recognize": [task.id for task in targets],
    }
    recognition = None
    if targets:
        inputs = [task_input(task, crops) for task in targets]
        started = time.monotonic()
        reply = await provider.recognize(source.sanitized.pages, inputs)
        record.recognize_ms = elapsed_ms(started)
        record.note(reply)
        record.recognized = True
        record.recognition = reply.raw
        recognition = read_recognition(reply.raw, inputs)
    tasks, origins = review_tasks(source.draft, recognition, source.sanitized.pages, source.layout)
    sent = hide_names(tasks, source.student_names)
    conditions = condition_images(source.draft, source.sanitized.pages, source.layout)
    record.input["review"] = [task.model_dump() for task in sent]
    record.input["reviewConditions"] = condition_record(conditions)
    started = time.monotonic()
    reply = await provider.review(sent, conditions)
    record.review_ms = elapsed_ms(started)
    record.note(reply)
    record.review = reply.raw
    review = read_review(reply.raw, sent)
    draft = checked_draft(merge_review(source.draft, tasks, review, origins), settings)
    record.draft = dump(draft)
    return draft
