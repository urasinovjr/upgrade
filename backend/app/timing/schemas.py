from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.api_model import ApiModel

Stage = Literal["preparation", "masking", "review", "export"]
Family = Literal["expressions", "fractions", "powers_roots", "equations", "inequalities", "mixed"]


class TimingOut(ApiModel):
    enabled: bool


class IntervalIn(ApiModel):
    id: UUID
    work_id: UUID
    stage: Stage
    started_at: datetime
    ended_at: datetime


class IntervalsIn(ApiModel):
    intervals: list[IntervalIn] = Field(max_length=200)


class IntervalsOut(ApiModel):
    accepted: int
    rejected: int
    unknown_work_ids: list[UUID]


class ManualSessionIn(ApiModel):
    student_id: UUID
    task_count: int = Field(ge=1, le=100)
    task_family: Family
    active_seconds: int = Field(ge=0, le=86400)
    corrected_seconds: int | None = Field(default=None, ge=0, le=86400)
    started_at: datetime
    finished_at: datetime


class ManualSessionOut(ManualSessionIn):
    id: UUID
