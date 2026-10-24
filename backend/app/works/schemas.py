from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.api_model import ApiModel
from app.students import StudentOut

Text = Field(default="", max_length=10000)
ShortText = Field(max_length=200)


class CropRect(ApiModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)


PageMasks = dict[str, list[CropRect]]


class StepOrigin(ApiModel):
    file_id: str = Field(max_length=64)
    page: int = Field(ge=1)
    region: CropRect
    recognized_latex: str = Field(max_length=5000)


class ConditionRegion(ApiModel):
    file_id: str = Field(max_length=64)
    page: int = Field(ge=1)
    region: CropRect


class Step(ApiModel):
    id: str = Field(max_length=64)
    latex: str = Field(max_length=5000)
    verdict: Literal["correct", "error", "uncertain"]
    explanation: str = Field(max_length=5000)
    origin: StepOrigin | None = None


class GapProposal(ApiModel):
    topic_id: str = Field(max_length=64)
    reason: str = Field(max_length=5000)
    decision: Literal["hypothesis", "confirmed", "rejected"]


class Task(ApiModel):
    id: str = Field(max_length=64)
    title: str = ShortText
    condition: str = Text
    condition_attachment_ids: list[str] | None = Field(default=None, max_length=20)
    condition_region: ConditionRegion | None = None
    formula: str = Field(max_length=5000)
    reference: str = Text
    topic_id: str = Field(max_length=64)
    task_type_id: str = Field(default="", max_length=64)
    steps: list[Step] = Field(max_length=200)
    feedback: str = Text
    reviewed: bool
    omitted: bool
    gap: GapProposal | None = None


class Draft(ApiModel):
    revision: int
    input_revision: int
    analysed_input_revision: int
    tasks: list[Task] = Field(max_length=100)
    feedback: str = Text


class AttachmentOut(ApiModel):
    id: UUID
    name: str
    type: str
    size: int
    pages: int
    page_order: list[int]
    crops: dict[str, CropRect]
    masks: PageMasks = Field(default_factory=dict)
    checked_pages: list[int] = Field(default_factory=list)


class SentPageOut(ApiModel):
    index: int
    file_id: UUID
    page: int
    content_type: str
    width: int
    height: int
    sha256: str


class AnalysisInfo(ApiModel):
    run_id: UUID
    provider: str
    model: str
    prompt_version: str
    finished_at: datetime


class PublishedRevision(ApiModel):
    id: UUID
    number: int
    confirmed_at: datetime
    draft: Draft
    attachments: list[AttachmentOut]
    analysis: AnalysisInfo | None = None


class WorkJob(ApiModel):
    token: str
    input_revision: int
    started_at: int
    completes_at: int
    outcome: Literal["ready", "failed", "needs_input"]


class WorkOut(ApiModel):
    id: UUID
    student_id: UUID
    title: str
    created_at: datetime
    demo: bool = False
    status: str
    attachments: list[AttachmentOut]
    draft: Draft
    published: list[PublishedRevision]
    current_published_id: UUID | None = None
    editing: bool
    manual: bool
    job: WorkJob | None = None
    initial_analysis: Draft | None = None
    analysis: AnalysisInfo | None = None


class AttachmentMeta(ApiModel):
    id: UUID
    name: str = Field(min_length=1, max_length=255)


class WorkCreateMeta(ApiModel):
    id: UUID
    student_id: UUID
    title: str = Field(min_length=1, max_length=200)
    attachments: list[AttachmentMeta] = Field(min_length=1, max_length=50)
    tasks: list[Task] = Field(max_length=100)


class DraftSaveIn(ApiModel):
    base_revision: int
    draft: Draft


class DraftSavedOut(ApiModel):
    revision: int
    input_revision: int


class AttachmentLayout(ApiModel):
    id: UUID
    page_order: list[int] = Field(min_length=1, max_length=1000)
    crops: dict[str, CropRect]
    masks: PageMasks = Field(default_factory=dict)
    checked_pages: list[int] = Field(default_factory=list, max_length=1000)


class ReportOut(ApiModel):
    work: WorkOut
    student: StudentOut
    revision: PublishedRevision


WorkAction = Literal["analyse", "manual", "confirm", "edit", "withdraw"]
