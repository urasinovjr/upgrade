import time
from dataclasses import dataclass, field
from decimal import Decimal

from pydantic import ValidationError

from app.analysis.contract import (
    DraftProvider,
    FileSource,
    InvalidReply,
    ProviderReply,
    read_recognition,
    read_review,
)
from app.analysis.drafting import merge_review, review_tasks, task_input, tasks_to_recognize
from app.config import Settings
from app.works.schemas import Draft
from app.works.service import draft_too_large, dump


@dataclass
class AnalysisSource:
    input_revision: int
    draft: Draft
    files: list[FileSource]
    layout: list[dict]
    last_layout: list[dict] | None


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

    def note(self, reply: ProviderReply) -> None:
        self.provider = reply.provider
        self.model = reply.model
        self.prompt_version = reply.prompt_version
        self.input_tokens += reply.input_tokens
        self.output_tokens += reply.output_tokens

    def price(self, settings: Settings) -> None:
        tokens_cost = (
            self.input_tokens * settings.price_input_per_mtok
            + self.output_tokens * settings.price_output_per_mtok
        )
        self.cost = tokens_cost / 1_000_000
        self.cost_currency = settings.price_currency


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
    targets = tasks_to_recognize(source.draft, source.layout, source.last_layout)
    record.input = {
        "layout": source.layout,
        "tasks": [task_input(task).model_dump() for task in source.draft.tasks],
        "recognize": [task.id for task in targets],
    }
    recognition = None
    if targets:
        inputs = [task_input(task) for task in targets]
        started = time.monotonic()
        reply = await provider.recognize(source.files, inputs)
        record.recognize_ms = elapsed_ms(started)
        record.note(reply)
        record.recognized = True
        record.recognition = reply.raw
        recognition = read_recognition(reply.raw, inputs)
    tasks = review_tasks(source.draft, recognition)
    record.input["review"] = [task.model_dump() for task in tasks]
    started = time.monotonic()
    reply = await provider.review(tasks)
    record.review_ms = elapsed_ms(started)
    record.note(reply)
    record.review = reply.raw
    review = read_review(reply.raw, tasks)
    draft = checked_draft(merge_review(source.draft, tasks, review), settings)
    record.draft = dump(draft)
    return draft
