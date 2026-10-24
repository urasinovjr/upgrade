import csv
import io
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from itertools import pairwise
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.corrections import (
    GAP_OUTCOMES,
    STEP_KINDS,
    TaskCorrection,
    changed_tasks,
    draft_corrections,
    edited_manually,
)
from app.analysis.report import Period, within
from app.knowledge.families import FAMILY_NAMES
from app.knowledge.task_types import TASK_TYPE_NAMES, TASK_TYPES
from app.timing.models import PilotParticipant
from app.works.models import AnalysisRun, Work, WorkRevision

TASK_FAMILIES = {item.id: item.family for item in TASK_TYPES}
VERDICT_NAMES = {"correct": "верно", "error": "ошибка", "uncertain": "неясно"}
STEP_NAMES = {
    "unchanged": "без изменений",
    "minor": "мелкая правка",
    "rewritten": "переписаны",
    "added": "добавлены",
    "removed": "удалены",
}
GAP_NAMES = {
    "confirmed": "принята",
    "rejected": "отклонена",
    "deleted": "удалена",
    "undecided": "без решения",
    "retopiced": "тема изменена",
}
OMITTED_NAMES = {"omitted": "задача отложена", "restored": "задача возвращена в разбор"}
CSV_COLUMNS = [
    "work_id",
    "teacher_id",
    "task_id",
    "variant",
    "family",
    "task_type",
    "manual",
    "added_task",
    *[f"steps_{kind}" for kind in STEP_KINDS],
    "verdicts_changed",
    "verdict_changes",
    "explanations_edited",
    "topic_changed",
    "type_changed",
    "omitted_change",
    "ai_gap",
    "teacher_gap",
    "confirmed_at",
]


@dataclass
class WorkCorrections:
    work_id: UUID
    teacher_id: UUID
    variant: str
    manual: bool
    confirmed_at: datetime
    tasks: list[TaskCorrection]
    later_versions: int = 0
    later_changed_tasks: int = 0


def variant_of(run: AnalysisRun) -> str:
    return f"{run.provider}/{run.model}/{run.prompt_version}"


def family_of(task: TaskCorrection) -> str:
    if not task.task_type_id:
        return "без типа"
    family = TASK_FAMILIES.get(task.task_type_id)
    return FAMILY_NAMES[family] if family else "вне охвата"


def type_of(task: TaskCorrection) -> str:
    return TASK_TYPE_NAMES.get(task.task_type_id, "без типа")


async def first_confirmations(
    session: AsyncSession, period: Period, pilot_only: bool
) -> list[tuple[WorkRevision, AnalysisRun, UUID]]:
    query = (
        select(WorkRevision, AnalysisRun, Work.teacher_id)
        .join(AnalysisRun, AnalysisRun.id == WorkRevision.analysis_run_id)
        .join(Work, Work.id == WorkRevision.work_id)
        .where(
            WorkRevision.number == 1,
            AnalysisRun.draft.is_not(None),
            *within(WorkRevision.confirmed_at, period),
        )
        .order_by(WorkRevision.confirmed_at)
    )
    if pilot_only:
        query = query.join(PilotParticipant, PilotParticipant.user_id == Work.teacher_id)
    rows = await session.execute(query)
    return [(revision, run, teacher_id) for revision, run, teacher_id in rows]


async def later_revisions(session: AsyncSession, work_ids: list[UUID]) -> dict[UUID, list[dict]]:
    if not work_ids:
        return {}
    rows = await session.scalars(
        select(WorkRevision)
        .where(WorkRevision.work_id.in_(work_ids))
        .order_by(WorkRevision.work_id, WorkRevision.number)
    )
    drafts: dict[UUID, list[dict]] = defaultdict(list)
    for revision in rows:
        drafts[revision.work_id].append(revision.draft)
    return drafts


async def work_corrections(
    session: AsyncSession, period: Period, pilot_only: bool
) -> list[WorkCorrections]:
    found = await first_confirmations(session, period, pilot_only)
    versions = await later_revisions(session, [revision.work_id for revision, _, _ in found])
    works = []
    for revision, run, teacher_id in found:
        drafts = versions.get(revision.work_id, [revision.draft])
        works.append(
            WorkCorrections(
                work_id=revision.work_id,
                teacher_id=teacher_id,
                variant=variant_of(run),
                manual=edited_manually(run.draft, revision.draft),
                confirmed_at=revision.confirmed_at,
                tasks=draft_corrections(run.draft, revision.draft),
                later_versions=len(drafts) - 1,
                later_changed_tasks=sum(
                    changed_tasks(before, after) for before, after in pairwise(drafts)
                ),
            )
        )
    return works


def share(part: int, whole: int) -> str:
    return f"{part} из {whole} ({part / whole:.0%})" if whole else f"{part} из 0"


def counts(names: dict[str, str], counter: Counter) -> str:
    return ", ".join(f"{names[key]} {counter[key]}" for key in names)


def verdict_lines(tasks: list[TaskCorrection]) -> list[str]:
    total: Counter = Counter()
    for task in tasks:
        total.update(task.verdicts)
    changed = {pair: count for pair, count in total.items() if pair[0] != pair[1]}
    lines = [f"Вердикты изменены: {share(sum(changed.values()), sum(total.values()))}"]
    for (before, after), count in sorted(changed.items(), key=lambda item: -item[1]):
        names = f"{VERDICT_NAMES.get(before, before)} → {VERDICT_NAMES.get(after, after)}"
        lines.append(f"  {names}: {count}")
    return lines


def gap_lines(tasks: list[TaskCorrection]) -> list[str]:
    outcomes = Counter(task.ai_gap for task in tasks if task.ai_gap)
    proposed = sum(outcomes.values())
    lines = [f"Гипотезы ИИ о пробелах: {proposed}"]
    if proposed:
        lines.append(f"  принята: {share(outcomes['confirmed'], proposed)}")
        lines.append("  " + counts({key: GAP_NAMES[key] for key in GAP_OUTCOMES[1:]}, outcomes))
    lines.append(f"Пробелы, добавленные репетитором: {sum(task.teacher_gap for task in tasks)}")
    return lines


def task_lines(tasks: list[TaskCorrection]) -> list[str]:
    steps: Counter = Counter()
    for task in tasks:
        steps.update(task.steps)
    omitted = Counter(task.omitted_change for task in tasks if task.omitted_change)
    return [
        f"Шаги: {counts(STEP_NAMES, steps)}",
        *verdict_lines(tasks),
        f"Объяснения исправлены: {sum(task.explanations_edited for task in tasks)}",
        f"Тема задачи изменена: {sum(task.topic_changed for task in tasks)}",
        f"Тип задачи изменён: {sum(task.type_changed for task in tasks)}",
        f"Пропуск задачи: {counts(OMITTED_NAMES, omitted)}",
        f"Задачи, добавленные репетитором: {sum(task.added_task for task in tasks)}",
        *gap_lines(tasks),
    ]


def group_line(title: str, tasks: list[TaskCorrection]) -> str:
    proposed = [task for task in tasks if task.ai_gap]
    accepted = sum(task.ai_gap == "confirmed" for task in proposed)
    steps = share(
        sum(task.changed_steps for task in tasks), sum(task.total_steps for task in tasks)
    )
    verdicts = share(
        sum(task.changed_verdicts for task in tasks), sum(task.total_verdicts for task in tasks)
    )
    return (
        f"  {title}: задач {len(tasks)}, шаги изменены {steps}, "
        f"вердикты изменены {verdicts}, гипотезы приняты {share(accepted, len(proposed))}"
    )


def grouped_lines(title: str, groups: dict[str, list[TaskCorrection]]) -> list[str]:
    return [title, *(group_line(name, groups[name]) for name in sorted(groups))]


def text_report(works: list[WorkCorrections]) -> str:
    if not works:
        return "нет данных"
    tasks = [task for work in works for task in work.tasks]
    by_variant: dict[str, list[TaskCorrection]] = defaultdict(list)
    by_family: dict[str, list[TaskCorrection]] = defaultdict(list)
    by_type: dict[str, list[TaskCorrection]] = defaultdict(list)
    for work in works:
        by_variant[work.variant].extend(work.tasks)
        for task in work.tasks:
            by_family[family_of(task)].append(task)
            by_type[type_of(task)].append(task)
    lines = [
        f"Работ с первым подтверждением: {len(works)}, задач: {len(tasks)}",
        f"Переведены в ручной режим после разбора: {sum(work.manual for work in works)}",
        *task_lines(tasks),
        "Исправлено после публикации: "
        f"версий {sum(work.later_versions for work in works)}, "
        f"задач {sum(work.later_changed_tasks for work in works)}",
        *grouped_lines("По варианту разбора:", by_variant),
        *grouped_lines("По семейству:", by_family),
        *grouped_lines("По типу задачи:", by_type),
    ]
    return "\n".join(lines)


def verdict_changes(task: TaskCorrection) -> str:
    pairs = sorted((before, after) for before, after in task.verdicts.elements() if before != after)
    return ";".join(f"{before}>{after}" for before, after in pairs)


def csv_report(works: list[WorkCorrections]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CSV_COLUMNS)
    for work in works:
        for task in work.tasks:
            writer.writerow(
                [
                    work.work_id,
                    work.teacher_id,
                    task.task_id,
                    work.variant,
                    family_of(task),
                    task.task_type_id,
                    int(work.manual),
                    int(task.added_task),
                    *[task.steps[kind] for kind in STEP_KINDS],
                    task.changed_verdicts,
                    verdict_changes(task),
                    task.explanations_edited,
                    int(task.topic_changed),
                    int(task.type_changed),
                    task.omitted_change,
                    task.ai_gap,
                    int(task.teacher_gap),
                    work.confirmed_at.isoformat(),
                ]
            )
    return buffer.getvalue()


async def corrections_report(
    session: AsyncSession, period: Period, pilot_only: bool, as_csv: bool
) -> str:
    works = await work_corrections(session, period, pilot_only)
    return csv_report(works) if as_csv else text_report(works)
