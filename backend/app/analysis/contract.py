from collections import Counter
from decimal import Decimal
from typing import Literal, Protocol

from pydantic import BaseModel, Field, ValidationError

from app.knowledge.catalog import KNOWN_TOPICS, canonical_topic
from app.knowledge.task_types import TASK_TYPE_IDS
from app.redaction import PageImage

Verdict = Literal["correct", "error", "uncertain"]


class InvalidReply(Exception):
    def __init__(self, reason: str, task_ids: list[str] | None = None):
        super().__init__(reason)
        self.reason = reason
        self.task_ids = task_ids or []


class Region(BaseModel):
    x: float
    y: float
    width: float
    height: float


class ConditionArea(BaseModel):
    file_id: str
    page: int
    region: Region


class TaskInput(BaseModel):
    id: str
    condition: str
    formula: str
    reference: str
    condition_file_ids: list[str]
    condition_region: ConditionArea | None = None
    solution_file_ids: list[str] | None = None


class StepInput(BaseModel):
    id: str
    latex: str
    legible: bool


class ReviewTask(TaskInput):
    steps: list[StepInput]


class ConditionImage(BaseModel):
    task_id: str
    image: PageImage
    region: Region | None = None
    kind: Literal["condition", "solution"] = "condition"


class ProviderReply(BaseModel):
    raw: dict
    provider: str
    model: str
    prompt_version: str
    input_tokens: int = 0
    output_tokens: int = 0
    generation_id: str | None = None
    actual_provider: str | None = None
    returned_model: str | None = None
    actual_cost_usd: Decimal | None = None
    processing: dict = Field(default_factory=dict)

    def call_metadata(self) -> dict:
        return self.model_dump(mode="json", exclude={"raw"})


class RecognizedStep(BaseModel):
    latex: str = Field(max_length=5000)
    legible: bool
    page: int | None = None
    region: Region | None = None


class RecognizedTask(BaseModel):
    task_id: str
    matched: bool
    steps: list[RecognizedStep] = Field(max_length=200)
    complete: bool | None = None
    issues: list[str] = Field(default_factory=list, max_length=50)


class Recognition(BaseModel):
    tasks: list[RecognizedTask]


class ReviewedStep(BaseModel):
    id: str
    verdict: Verdict
    explanation: str = Field(max_length=5000)
    consequence_of: str | None = None


class GapHypothesis(BaseModel):
    topic_id: str
    reason: str = Field(min_length=1, max_length=5000)


class ReviewedTask(BaseModel):
    task_id: str
    supported: bool
    reason: str = Field(default="", max_length=5000)
    topic_id: str
    task_type_id: str = Field(default="", max_length=64)
    steps: list[ReviewedStep] = Field(max_length=200)
    gap: GapHypothesis | None = None
    feedback: str = Field(default="", max_length=10000)
    gap_assessment: Literal["proposed", "not_evidenced", "insufficient_data"] | None = None
    gap_reason: str = Field(default="", max_length=5000)


class Review(BaseModel):
    tasks: list[ReviewedTask]


class DraftProvider(Protocol):
    async def recognize(self, pages: list[PageImage], tasks: list[TaskInput]) -> ProviderReply: ...

    async def review(
        self, tasks: list[ReviewTask], conditions: list[ConditionImage]
    ) -> ProviderReply: ...

    async def close(self) -> None: ...

    async def recognize_conditions(self, text: str, pages: list[PageImage]) -> ProviderReply: ...

    async def generate_material(self, topic_id: str, reason: str) -> ProviderReply: ...


def parse[T: BaseModel](model: type[T], raw: dict) -> T:
    try:
        return model.model_validate(raw)
    except ValidationError as error:
        raise InvalidReply("schema") from error


def same_ids(found: list[str], expected: list[str]) -> bool:
    return Counter(found) == Counter(expected)


def read_recognition(raw: dict, tasks: list[TaskInput]) -> Recognition:
    recognition = parse(Recognition, raw)
    found = [item.task_id for item in recognition.tasks]
    if not same_ids(found, [task.id for task in tasks]):
        raise InvalidReply("task_ids")
    return recognition


def check_reviewed_task(item: ReviewedTask, step_ids: list[str]) -> None:
    topics = [item.topic_id] + ([item.gap.topic_id] if item.gap else [])
    if any(topic not in KNOWN_TOPICS for topic in topics):
        raise InvalidReply("topic")
    if item.task_type_id and item.task_type_id not in TASK_TYPE_IDS:
        raise InvalidReply("task_type")
    if not item.supported:
        if not item.reason.strip():
            raise InvalidReply("unsupported_reason")
        return
    if not same_ids([step.id for step in item.steps], step_ids):
        raise InvalidReply("step_ids")
    if any(step.verdict == "error" and not step.explanation.strip() for step in item.steps):
        raise InvalidReply("error_explanation")


def read_review(raw: dict, tasks: list[ReviewTask]) -> Review:
    review = parse(Review, raw)
    expected = {task.id: [step.id for step in task.steps] for task in tasks}
    if not same_ids([item.task_id for item in review.tasks], [task.id for task in tasks]):
        raise InvalidReply("task_ids")
    for item in review.tasks:
        try:
            check_reviewed_task(item, expected[item.task_id])
        except InvalidReply as error:
            error.task_ids = [item.task_id]
            raise
        item.topic_id = canonical_topic(item.topic_id)
        if item.gap:
            item.gap.topic_id = canonical_topic(item.gap.topic_id)
    return review
