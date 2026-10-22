import csv
import hashlib
import json
import time
from collections.abc import AsyncIterator
from dataclasses import asdict
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

from app.analysis.contract import DraftProvider, InvalidReply
from app.analysis.pipeline import AnalysisSource, RunRecord, build_draft, elapsed_ms
from app.analysis.variants import Variant, code_commit
from app.config import Settings
from app.evaluation.auto import ai_view, summarize, task_row
from app.evaluation.manifest import Manifest, TaskCard, WorkCard, admitted_tasks
from app.files.inspection import sniff_type
from app.knowledge.topics import TOPICS
from app.provider import ProviderError
from app.redaction import PageUnreadable, SourceFile, sanitize_pages
from app.works.review import initial_draft
from app.works.schemas import Draft, Task

EXPERT_COLUMNS = [
    "work_id",
    "task_id",
    "family",
    "expert_correct",
    "ai_verdict",
    "expert_first_error",
    "ai_first_error",
    "first_error_match",
    "expert_topic",
    "ai_topic",
    "topic_match",
    "refused",
    "expert_explanation",
    "ai_explanation",
    "explanation_ok",
    "recognition_ok",
    "note",
]


class FolderStorage:
    def __init__(self, folder: Path):
        self.folder = folder

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        path = self.folder / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    async def open(self, key: str) -> AsyncIterator[bytes]:
        return self.chunks((self.folder / key).read_bytes())

    async def chunks(self, data: bytes) -> AsyncIterator[bytes]:
        yield data

    async def delete_prefix(self, prefix: str) -> int:
        return 0

    async def close(self) -> None:
        pass


def topics_hash() -> str:
    payload = json.dumps([(topic.id, topic.prerequisites) for topic in TOPICS])
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def card_task(card: TaskCard) -> Task:
    return Task(
        id=card.task_id,
        title=card.task_id,
        condition=card.condition,
        formula=card.formula,
        reference=card.reference,
        topic_id="",
        steps=[],
        feedback="",
        reviewed=False,
        omitted=False,
    )


def sources_of(root: Path, work: WorkCard) -> tuple[list[SourceFile], list[dict]]:
    sources = []
    layout = []
    for index, card in enumerate(work.files):
        data = (root / card.path).read_bytes()
        file_id = f"{work.work_id}-{index + 1}"
        sources.append(
            SourceFile(
                file_id=file_id,
                content_type=sniff_type(data[:16]) or "",
                data=data,
                page_order=card.page_order,
                crops=card.crops,
                masks=card.masks,
            )
        )
        layout.append(
            {"id": file_id, "pageOrder": card.page_order, "crops": card.crops, "masks": card.masks}
        )
    return sources, layout


async def run_work(
    root: Path,
    work: WorkCard,
    provider: DraftProvider,
    settings: Settings,
    pages: Path,
    variant: Variant,
) -> tuple[Draft | None, RunRecord, str | None]:
    record = RunRecord(variant=variant.name, code_commit=code_commit(settings))
    sources, layout = sources_of(root, work)
    started = time.monotonic()
    try:
        sanitized = await sanitize_pages(FolderStorage(pages), settings, uuid4(), uuid4(), sources)
        source = AnalysisSource(
            input_revision=0,
            draft=initial_draft([card_task(card) for card in admitted_tasks(work)]),
            sanitized=sanitized,
            sanitize_ms=elapsed_ms(started),
            layout=layout,
            last_layout=None,
        )
        draft = await build_draft(provider, source, settings, record)
        error = None
    except InvalidReply as failure:
        draft, error = None, failure.reason
    except (ProviderError, PageUnreadable) as failure:
        draft, error = None, failure.code
    record.price(variant)
    return draft, record, error


def expert_row(work: WorkCard, card: TaskCard, task: Task | None) -> dict:
    view = ai_view(task)
    expert_first = card.first_error_step if card.correct is False else ""
    return {
        "work_id": work.work_id,
        "task_id": card.task_id,
        "family": card.family,
        "expert_correct": "yes" if card.correct else "no",
        "ai_verdict": view["verdict"],
        "expert_first_error": expert_first,
        "ai_first_error": view["first_error"],
        "first_error_match": "yes" if expert_first == view["first_error"] else "no",
        "expert_topic": card.topic_id,
        "ai_topic": view["topic"],
        "topic_match": "yes" if card.topic_id == view["topic"] else "no",
        "refused": "yes" if view["verdict"] == "refused" else "no",
        "expert_explanation": card.explanation,
        "ai_explanation": view["explanation"],
        "explanation_ok": "",
        "recognition_ok": "",
        "note": "",
    }


def run_summary(record: RunRecord, error: str | None) -> dict:
    data = asdict(record)
    data["cost"] = str(record.cost)
    data["error"] = error
    return data


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")


async def run_split(
    manifest: Manifest,
    root: Path,
    split: str,
    out: Path,
    provider: DraftProvider,
    settings: Settings,
    variant: Variant,
) -> str:
    out.mkdir(parents=True, exist_ok=True)
    (out / "runs").mkdir(exist_ok=True)
    rows = []
    meta = {
        "datasetVersion": manifest.dataset_version,
        "split": split,
        "topicsHash": topics_hash(),
        "limits": [settings.redaction_dpi, settings.redaction_max_side],
        "startedAt": datetime.now(UTC).isoformat(),
        "works": 0,
        "failedWorks": 0,
        "cost": "0",
        "currency": variant.currency,
        "variant": variant.name,
        "codeCommit": code_commit(settings),
        "provider": "",
        "model": "",
        "promptVersion": "",
    }
    total_cost = Decimal(0)
    task_rows = []
    runs = []
    for work in [item for item in manifest.works if item.split == split]:
        draft, record, error = await run_work(
            root, work, provider, settings, out / "pages", variant
        )
        tasks = {task.id: task for task in draft.tasks} if draft else {}
        rows += [expert_row(work, card, tasks.get(card.task_id)) for card in admitted_tasks(work)]
        task_rows += [
            task_row(work, card, tasks.get(card.task_id)) for card in admitted_tasks(work)
        ]
        runs.append((record, error))
        (out / "runs" / f"{work.work_id}.json").write_text(
            json.dumps(run_summary(record, error), ensure_ascii=False, indent=2), "utf-8"
        )
        meta["works"] += 1
        meta["failedWorks"] += 1 if error else 0
        meta["provider"] = record.provider or meta["provider"]
        meta["model"] = record.model or meta["model"]
        meta["promptVersion"] = record.prompt_version or meta["promptVersion"]
        total_cost += record.cost
    meta["cost"] = str(total_cost)
    meta["finishedAt"] = datetime.now(UTC).isoformat()
    with (out / "expert.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=EXPERT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), "utf-8")
    write_json(out / "tasks.json", task_rows)
    write_json(out / "auto.json", summarize(task_rows, runs))
    return (
        f"{split}: работ {meta['works']}, без ответа {meta['failedWorks']}, задач {len(rows)}. "
        f"Заполните explanation_ok и recognition_ok в {out / 'expert.csv'}"
    )
