import csv
import io
import statistics
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis import WORK_ANALYSIS_JOB
from app.queue import Job
from app.timing.models import STAGES, ActiveInterval, ManualSession
from app.works.models import Work

CSV_COLUMNS = [
    "method",
    "teacher_id",
    "item_id",
    "tasks",
    "family",
    "active_seconds",
    "waiting_seconds",
    "finished_at",
]


@dataclass
class Observation:
    method: str
    teacher_id: UUID
    item_id: UUID
    tasks: int
    family: str
    active_seconds: float
    finished_at: datetime
    waiting_seconds: float | None = None
    stages: dict[str, float] = field(default_factory=dict)


@dataclass
class Summary:
    count: int
    median: float
    low_quartile: float
    high_quartile: float
    smallest: float
    largest: float


def summary(values: list[float]) -> Summary | None:
    if not values:
        return None
    if len(values) == 1:
        low = high = values[0]
    else:
        low, _, high = statistics.quantiles(values, n=4, method="inclusive")
    return Summary(len(values), statistics.median(values), low, high, min(values), max(values))


def savings(upgrade: list[float], manual: list[float]) -> float | None:
    if not upgrade or not manual or statistics.median(manual) == 0:
        return None
    return 1 - statistics.median(upgrade) / statistics.median(manual)


def in_period(column, since: datetime | None, until: datetime | None) -> list:
    conditions = []
    if since is not None:
        conditions.append(column >= since)
    if until is not None:
        conditions.append(column < until)
    return conditions


def task_count(work: Work) -> int:
    return max(1, len(work.draft.get("tasks", [])))


async def waiting_by_work(session: AsyncSession, work_ids: list[UUID]) -> dict[UUID, float]:
    if not work_ids:
        return {}
    jobs = await session.scalars(
        select(Job).where(
            Job.kind == WORK_ANALYSIS_JOB, Job.subject_id.in_(work_ids), Job.status == "done"
        )
    )
    waiting: dict[UUID, float] = defaultdict(float)
    for job in jobs:
        if job.finished_at is not None:
            waiting[job.subject_id] += (job.finished_at - job.created_at).total_seconds()
    return waiting


async def intervals_of(session: AsyncSession, work_ids: list[UUID]) -> list[ActiveInterval]:
    if not work_ids:
        return []
    rows = await session.scalars(select(ActiveInterval).where(ActiveInterval.work_id.in_(work_ids)))
    return list(rows)


async def upgrade_observations(
    session: AsyncSession, since: datetime | None, until: datetime | None
) -> list[Observation]:
    works = list(
        await session.scalars(
            select(Work).where(
                Work.current_revision_id.is_not(None), *in_period(Work.created_at, since, until)
            )
        )
    )
    ids = [work.id for work in works]
    stages: dict[UUID, dict[str, float]] = defaultdict(lambda: dict.fromkeys(STAGES, 0.0))
    for interval in await intervals_of(session, ids):
        seconds = (interval.ended_at - interval.started_at).total_seconds()
        stages[interval.work_id][interval.stage] += seconds
    waiting = await waiting_by_work(session, ids)
    return [
        Observation(
            method="upgrade",
            teacher_id=work.teacher_id,
            item_id=work.id,
            tasks=task_count(work),
            family="",
            active_seconds=sum(stages[work.id].values()),
            finished_at=work.created_at,
            waiting_seconds=waiting.get(work.id, 0.0),
            stages=stages[work.id],
        )
        for work in works
        if work.id in stages
    ]


async def manual_observations(
    session: AsyncSession, since: datetime | None, until: datetime | None
) -> list[Observation]:
    rows = await session.scalars(
        select(ManualSession).where(*in_period(ManualSession.finished_at, since, until))
    )
    return [
        Observation(
            method="manual",
            teacher_id=item.teacher_id,
            item_id=item.id,
            tasks=item.task_count,
            family=item.task_family,
            active_seconds=float(
                item.corrected_seconds
                if item.corrected_seconds is not None
                else item.active_seconds
            ),
            finished_at=item.finished_at,
        )
        for item in rows
    ]


def minutes(seconds: float) -> str:
    return f"{seconds / 60:.1f}"


def summary_line(title: str, values: list[float]) -> str:
    found = summary(values)
    if found is None:
        return f"{title}: нет данных"
    return (
        f"{title}: n={found.count} медиана {minutes(found.median)} мин, "
        f"квартили {minutes(found.low_quartile)}–{minutes(found.high_quartile)}, "
        f"разброс {minutes(found.smallest)}–{minutes(found.largest)}"
    )


def savings_line(title: str, upgrade: list[float], manual: list[float]) -> str:
    found = savings(upgrade, manual)
    if found is None:
        return f"{title}: нет данных"
    verdict = "цель достигнута" if found >= 0.5 else "цель не достигнута"
    return f"{title}: {found:.2f} (цель не меньше 0.50, {verdict})"


def per_task(observations: list[Observation]) -> list[float]:
    return [item.active_seconds / item.tasks for item in observations]


def teacher_lines(upgrade: list[Observation], manual: list[Observation]) -> list[str]:
    teachers = sorted({item.teacher_id for item in [*upgrade, *manual]}, key=str)
    lines = []
    for teacher in teachers:
        own_upgrade = [item.active_seconds for item in upgrade if item.teacher_id == teacher]
        own_manual = [item.active_seconds for item in manual if item.teacher_id == teacher]
        lines.append(
            f"{teacher}: UpGrade n={len(own_upgrade)}, ручная n={len(own_manual)}, "
            + savings_line("экономия", own_upgrade, own_manual)
        )
    return lines


def text_report(upgrade: list[Observation], manual: list[Observation]) -> str:
    upgrade_seconds = [item.active_seconds for item in upgrade]
    manual_seconds = [item.active_seconds for item in manual]
    lines = [
        summary_line("UpGrade, активное время на работу", upgrade_seconds),
        summary_line("Ручная проверка, время на работу", manual_seconds),
        savings_line("Экономия по медианам", upgrade_seconds, manual_seconds),
        savings_line("Экономия на одну задачу", per_task(upgrade), per_task(manual)),
        summary_line(
            "Ожидание ИИ, не входит в активное время",
            [item.waiting_seconds or 0.0 for item in upgrade],
        ),
    ]
    for stage in STAGES:
        lines.append(summary_line(f"Этап {stage}", [item.stages[stage] for item in upgrade]))
    return "\n".join([*lines, "По репетиторам:", *teacher_lines(upgrade, manual)])


def csv_report(observations: list[Observation]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CSV_COLUMNS)
    for item in observations:
        writer.writerow(
            [
                item.method,
                item.teacher_id,
                item.item_id,
                item.tasks,
                item.family,
                round(item.active_seconds),
                "" if item.waiting_seconds is None else round(item.waiting_seconds),
                item.finished_at.isoformat(),
            ]
        )
    return buffer.getvalue()


async def timing_report(
    session: AsyncSession, since: datetime | None, until: datetime | None, as_csv: bool
) -> str:
    upgrade = await upgrade_observations(session, since, until)
    manual = await manual_observations(session, since, until)
    if as_csv:
        return csv_report([*upgrade, *manual])
    return text_report(upgrade, manual)
