from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from app.api_model import ApiModel


class ExamPosition(ApiModel):
    exam: Literal["oge", "ege"]
    level: Literal["basic", "profile"] | None = None
    year: Literal[2026, 2027]
    document_version: str = Field(min_length=1, max_length=64)
    position: int = Field(ge=1, le=25)

    @model_validator(mode="after")
    def check_position(self):
        from app.homework.exams import validate_position

        validate_position(self)
        return self


class HomeworkTask(ApiModel):
    id: UUID
    title: str = Field(min_length=1, max_length=200)
    condition: str = Field(default="", max_length=10000)
    formula: str = Field(default="", max_length=5000)
    topic_id: str = Field(default="", max_length=64)
    task_type_id: str = Field(default="", max_length=64)
    condition_file_ids: list[UUID] = Field(default_factory=list, max_length=20)
    exam: ExamPosition | None = None
    confirmed: bool = False


class HomeworkSave(ApiModel):
    title: str = Field(min_length=1, max_length=200)
    tasks: list[HomeworkTask] = Field(default_factory=list, max_length=100)
    base_revision: int = Field(ge=0)
    source_text: str | None = Field(default=None, max_length=30000)

    @field_validator("tasks")
    @classmethod
    def unique_tasks(cls, tasks):
        if len({task.id for task in tasks}) != len(tasks):
            raise ValueError("Задания повторяются")
        return tasks


class DeadlineIn(ApiModel):
    deadline: datetime | None = None

    @field_validator("deadline")
    @classmethod
    def aware_deadline(cls, value):
        if value is not None and value.utcoffset() is None:
            raise ValueError("Укажите часовой пояс срока сдачи")
        return value


class AssignIn(DeadlineIn):
    student_ids: list[UUID] = Field(min_length=1, max_length=200)
    base_revision: int


class SubmissionIn(ApiModel):
    id: UUID
    task_files: dict[str, list[UUID]]


class ActivateIn(ApiModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=10, max_length=128)


class StudentLoginIn(ApiModel):
    login: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class RecognizeIn(ApiModel):
    base_revision: int
    text: str = Field(default="", max_length=30000)
    file_ids: list[UUID] = Field(default_factory=list, max_length=20)


class MaterialIn(ApiModel):
    work_id: UUID
    task_id: str = Field(max_length=64)


class Exercise(ApiModel):
    condition: str = Field(min_length=1, max_length=10000)
    answer: str = Field(min_length=1, max_length=5000)
    solution: str = Field(min_length=1, max_length=10000)


class MaterialContent(ApiModel):
    explanation: str = Field(min_length=1, max_length=10000)
    exercises: list[Exercise] = Field(min_length=3, max_length=3)
