from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class WorkCreate(BaseModel):
    teacher_id: str = Field(min_length=1, max_length=64)
    student_id: str = Field(min_length=1, max_length=64)
    pages: int = Field(ge=1, le=20)


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    work_id: UUID = Field(validation_alias="subject_id")
    status: str
    attempts: int
    last_error: str | None


class ResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    work_id: UUID
    text: str
    analysis: dict


class ErrorOut(BaseModel):
    detail: str
