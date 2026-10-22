import csv
import io
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.service import WORK_ANALYSIS_JOB
from app.queue import Job
from app.works.models import AnalysisRun

CSV_COLUMNS = [
    "run_id",
    "work_id",
    "created_at",
    "status",
    "error",
    "request_id",
    "tasks",
    "queued_ms",
    "recognize_ms",
    "review_ms",
    "input_tokens",
    "output_tokens",
    "cost",
    "cost_currency",
]


@dataclass
class Spread:
    count: int
    p50: float
    p95: float


@dataclass
class Period:
    since: datetime | None
    until: datetime | None


def spread(values: list[float]) -> Spread | None:
    if not values:
        return None
    if len(values) == 1:
        return Spread(1, values[0], values[0])
    cuts = statistics.quantiles(values, n=100, method="inclusive")
    return Spread(len(values), cuts[49], cuts[94])


def within(column, period: Period) -> list:
    conditions = []
    if period.since is not None:
        conditions.append(column >= period.since)
    if period.until is not None:
        conditions.append(column < period.until)
    return conditions


async def runs_in(session: AsyncSession, period: Period) -> list[AnalysisRun]:
    query = select(AnalysisRun).where(*within(AnalysisRun.created_at, period))
    return list(await session.scalars(query.order_by(AnalysisRun.created_at)))


async def jobs_in(session: AsyncSession, period: Period) -> list[Job]:
    query = select(Job).where(Job.kind == WORK_ANALYSIS_JOB, *within(Job.created_at, period))
    return list(await session.scalars(query))


def task_count(run: AnalysisRun) -> int:
    return len(run.input.get("tasks", []))


def stage_values(runs: list[AnalysisRun]) -> dict[str, list[float]]:
    stages = {"queued": [], "recognize": [], "review": [], "total": []}
    for run in runs:
        parts = {"queued": run.queued_ms, "recognize": run.recognize_ms, "review": run.review_ms}
        for name, value in parts.items():
            if value is not None:
                stages[name].append(value)
        stages["total"].append(sum(value or 0 for value in parts.values()))
    return stages


def waiting_values(jobs: list[Job]) -> list[float]:
    return [
        (job.finished_at - job.created_at).total_seconds() * 1000
        for job in jobs
        if job.status == "done" and job.finished_at is not None
    ]


def cost_lines(runs: list[AnalysisRun]) -> list[str]:
    currency = next((run.cost_currency for run in runs if run.cost_currency), "")
    total = sum((run.cost for run in runs), Decimal(0))
    per_work: dict = defaultdict(Decimal)
    for run in runs:
        per_work[run.work_id] += run.cost
    per_task = [float(run.cost) / task_count(run) for run in runs if task_count(run)]
    lines = [f"cost total {total} {currency}".rstrip()]
    groups = {"per work": [float(cost) for cost in per_work.values()], "per task": per_task}
    for name, values in groups.items():
        found = spread(values)
        if found is not None:
            lines.append(f"cost {name}: n={found.count} p50={found.p50:.6f} p95={found.p95:.6f}")
    return lines


def counts_line(title: str, counter: Counter) -> str:
    parts = ", ".join(f"{key} {value}" for key, value in sorted(counter.items()))
    return f"{title}: {parts or 'нет'}"


def text_report(runs: list[AnalysisRun], jobs: list[Job]) -> str:
    if not runs and not jobs:
        return "нет данных"
    lines = [
        f"runs {len(runs)}",
        counts_line("run status", Counter(run.status for run in runs)),
        counts_line("run errors", Counter(run.error for run in runs if run.error)),
        f"jobs {len(jobs)}",
        counts_line("job status", Counter(job.status for job in jobs)),
        counts_line("job last errors", Counter(job.last_error for job in jobs if job.last_error)),
        "stage ms: n p50 p95",
    ]
    stages = {**stage_values(runs), "waiting": waiting_values(jobs)}
    for name, values in stages.items():
        found = spread(values)
        if found is not None:
            lines.append(f"{name} {found.count} {found.p50:.0f} {found.p95:.0f}")
    return "\n".join(lines + cost_lines(runs))


def csv_report(runs: list[AnalysisRun]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CSV_COLUMNS)
    for run in runs:
        values = {column: getattr(run, column, None) for column in CSV_COLUMNS}
        values["run_id"] = run.id
        values["tasks"] = task_count(run)
        writer.writerow([values[column] for column in CSV_COLUMNS])
    return buffer.getvalue()


async def analysis_report(session: AsyncSession, period: Period, as_csv: bool) -> str:
    runs = await runs_in(session, period)
    if as_csv:
        return csv_report(runs)
    return text_report(runs, await jobs_in(session, period))
