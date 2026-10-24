from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StringConstraints

from app.api_model import ApiModel

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Alias = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class StudentIn(ApiModel):
    name: Name
    grade: int = Field(ge=9, le=11)
    goal: str = Field(max_length=500)
    color: Literal["teal", "sand", "lilac", "blue"]
    aliases: list[Alias] = Field(default_factory=list, max_length=10)


class StudentOut(ApiModel):
    id: UUID
    name: str
    grade: int
    goal: str
    color: str
    aliases: list[str]
    archived_at: datetime | None


class ArchiveIn(ApiModel):
    archived: bool
