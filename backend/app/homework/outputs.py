from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.api_model import ApiModel
from app.homework.schemas import HomeworkTask, MaterialContent
from app.works.schemas import PageMasks


class HomeworkFileOut(ApiModel):
    id: UUID
    name: str
    type: str
    pages: int
    masks: PageMasks
    checked_pages: list[int]


class ExamPositionOut(ApiModel):
    position: int
    name: str
    content_codes: str
    requirement_codes: str


class ExamCatalogOut(ApiModel):
    exam: Literal["oge", "ege"]
    level: Literal["basic", "profile"] | None
    year: int
    document_version: str
    status: Literal["final", "project"]
    verified_at: date
    source: str
    archive: str
    specification_sha256: str
    positions: list[ExamPositionOut]


class AssignmentOut(ApiModel):
    id: UUID
    student_id: UUID


class HomeworkOut(ApiModel):
    id: UUID
    title: str
    revision: int
    tasks: list[HomeworkTask]
    source_text: str
    recognition_job_id: UUID | None
    assigned_at: datetime | None
    deadline: datetime | None
    created_at: datetime
    files: list[HomeworkFileOut]
    assignments: list[AssignmentOut]


class RecognitionOut(ApiModel):
    tasks: list[HomeworkTask]


class HomeworkJobOut(ApiModel):
    id: UUID
    kind: Literal["condition_recognition", "remediation"]
    status: Literal["queued", "ready", "failed", "stale", "needs_input"]
    revision: int
    result: RecognitionOut | MaterialContent | None
    provenance: dict


class InvitationOut(ApiModel):
    login: str
    url: str


class StudentLoginOut(ApiModel):
    login: str
    csrf_token: str


class StudentSessionOut(StudentLoginOut):
    id: UUID
    name: str
    grade: int
    writable: bool


class StudentSubmissionOut(ApiModel):
    id: UUID
    late: bool
    status: Literal["submitted"]


class StudentStepOut(ApiModel):
    id: str
    latex: str
    verdict: Literal["correct", "error", "uncertain"]
    explanation: str


class StudentGapOut(ApiModel):
    topic_id: str
    reason: str
    closed: bool = False


class StudentTaskOut(ApiModel):
    id: str
    title: str
    condition: str
    formula: str
    steps: list[StudentStepOut]
    feedback: str
    result: Literal["solved", "errors", "needs_clarification"]
    gap: StudentGapOut | None


class StudentResultOut(ApiModel):
    tasks: list[StudentTaskOut]
    feedback: str


class StudentHistoryOut(ApiModel):
    id: UUID
    assignment_id: UUID | None
    title: str
    attempt_number: int = Field(ge=1)
    late: bool
    submitted_at: datetime
    status: Literal["submitted", "published"]
    result: StudentResultOut | None


class StudentAssignmentOut(ApiModel):
    id: UUID
    title: str
    tasks: list[HomeworkTask]
    files: list[HomeworkFileOut]
    deadline: datetime | None


class StudentStateOut(ApiModel):
    assignments: list[StudentAssignmentOut]
    submissions: list[StudentHistoryOut]
    knowledge: list[StudentGapOut]
