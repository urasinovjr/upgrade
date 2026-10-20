from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.api_model import ApiModel

TOPIC_PATTERN = r"^[a-z0-9_-]{1,64}$"


class ClosureIn(ApiModel):
    topic_id: str = Field(pattern=TOPIC_PATTERN)
    action: Literal["close", "reopen"]
    note: str = Field(max_length=2000)


class ClosureOut(ApiModel):
    student_id: UUID
    topic_id: str
    action: str
    note: str
    at: datetime = Field(validation_alias="created_at")
