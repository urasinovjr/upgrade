from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.api_model import ApiModel
from app.knowledge.families import Family

Stage = Literal["preparation", "masking", "review", "export", "teacher_upload", "remediation"]


class TimingOut(ApiModel):
    enabled: bool


class ActiveTimeOut(ApiModel):
    work_id: UUID | None
    homework_id: UUID | None
    stage: Stage
    active_seconds: float


class IntervalIn(ApiModel):
    id: UUID
    work_id: UUID | None = None
    homework_id: UUID | None = None
    stage: Stage
    started_at: datetime
    ended_at: datetime

    @model_validator(mode="after")
    def valid_target(self):
        if (self.work_id is None) == (self.homework_id is None):
            raise ValueError("Укажите одну работу или одно ДЗ.")
        if self.started_at.utcoffset() is None or self.ended_at.utcoffset() is None:
            raise ValueError("Укажите часовой пояс интервала.")
        return self


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
