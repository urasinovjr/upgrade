import json
from pathlib import Path
from typing import Literal

from pydantic import Field

from app.api_model import ApiModel
from app.knowledge.families import Family

Split = Literal["dev", "acceptance"]


class CardFile(ApiModel):
    path: str = Field(min_length=1)
    page_order: list[int] = Field(default_factory=lambda: [1], min_length=1)
    crops: dict[str, dict] = Field(default_factory=dict)
    masks: dict[str, list[dict]] = Field(default_factory=dict)


class TaskCard(ApiModel):
    task_id: str = Field(min_length=1, max_length=64)
    family: Family
    condition: str = ""
    formula: str = ""
    reference: str = ""
    transcription: list[str] = Field(default_factory=list)
    correct: bool | None = None
    first_error_step: int | None = None
    explanation: str = ""
    topic_id: str = ""
    task_type: str = ""
    legibility: Literal["legible", "partly", "illegible"] = "legible"
    admission: Literal["admitted", "excluded"] = "admitted"
    exclusion_reason: str = ""


class WorkCard(ApiModel):
    work_id: str = Field(min_length=1, max_length=64)
    split: Split
    solution_group: str = Field(min_length=1)
    files: list[CardFile] = Field(min_length=1)
    tasks: list[TaskCard] = Field(min_length=1)


class Manifest(ApiModel):
    dataset_version: str = Field(min_length=1)
    works: list[WorkCard]


def load_manifest(root: Path) -> Manifest:
    return Manifest.model_validate(json.loads((root / "manifest.json").read_text("utf-8")))


def admitted_tasks(work: WorkCard) -> list[TaskCard]:
    return [task for task in work.tasks if task.admission == "admitted"]
