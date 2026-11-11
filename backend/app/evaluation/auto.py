import math
import re
from collections import Counter, defaultdict
from decimal import Decimal
from difflib import SequenceMatcher

from app.analysis.pipeline import RunRecord
from app.evaluation.manifest import TaskCard, WorkCard
from app.works.schemas import Task

SPACING = re.compile(r"\\(?:left|right|quad|qquad|[,;:! ])")
WHITESPACE = re.compile(r"\s+")
SAME_COMMANDS = {"\\dfrac": "\\frac", "\\tfrac": "\\frac", "\\cdot": "*", "\\times": "*"}


def ai_view(task: Task | None) -> dict:
    if task is None or task.omitted:
        return {"verdict": "refused", "first_error": "", "topic": "", "explanation": ""}
    verdicts = [step.verdict for step in task.steps]
    errors = [index for index, verdict in enumerate(verdicts, start=1) if verdict == "error"]
    verdict = "error" if errors else "uncertain" if "uncertain" in verdicts else "correct"
    explanation = task.steps[errors[0] - 1].explanation if errors else task.feedback
    return {
        "verdict": verdict,
        "first_error": errors[0] if errors else "",
        "topic": task.topic_id,
        "explanation": explanation,
    }


def normalize_latex(text: str) -> str:
    text = SPACING.sub("", text.replace("$", ""))
    for command, replacement in SAME_COMMANDS.items():
        text = text.replace(command, replacement)
    return WHITESPACE.sub("", text)


def similarity(expected: str, found: str) -> float:
    return SequenceMatcher(None, normalize_latex(expected), normalize_latex(found)).ratio()


def recognition_score(expected: list[str], found: list[str]) -> float | None:
    if not expected:
        return None
    pairs = zip(expected, found, strict=False)
    total = sum(similarity(left, right) for left, right in pairs)
    return total / max(len(expected), len(found))


def type_match(card: TaskCard, task: Task | None) -> bool | None:
    if not card.task_type:
        return None
    return task is not None and task.task_type_id == card.task_type


def transcription_complete(expected: list[str], found: list[str]) -> bool | None:
    if not expected:
        return None
    position = 0
    for line in expected:
        while position < len(found) and similarity(line, found[position]) < 0.8:
            position += 1
        if position == len(found):
            return False
        position += 1
    return True


def task_row(work: WorkCard, card: TaskCard, task: Task | None) -> dict:
    view = ai_view(task)
    found = [step.latex for step in task.steps] if task and not task.omitted else []
    expected_verdict = card.expected_verdict or ("correct" if card.correct else "error")
    first_error_ok = card.first_error_step is None or view["first_error"] == card.first_error_step
    verdict_ok = view["verdict"] == expected_verdict
    return {
        "workId": work.work_id,
        "taskId": card.task_id,
        "family": card.family,
        "expertCorrect": card.correct,
        "aiVerdict": view["verdict"],
        "verdictMatch": verdict_ok,
        "firstErrorMatch": verdict_ok and first_error_ok,
        "falseError": card.correct is True and view["verdict"] == "error",
        "refused": view["verdict"] == "refused",
        "topicMatch": view["topic"] == card.topic_id,
        "taskType": card.task_type,
        "scenario": card.scenario,
        "taskTypeMatch": type_match(card, task),
        "recognition": recognition_score(card.transcription, found),
        "stepCount": [len(card.transcription), len(found)],
        "transcriptionComplete": transcription_complete(card.transcription, found),
        "gapPresent": bool(task and task.gap),
        "gapPresenceMatch": (
            bool(task and task.gap) == card.expected_gap if card.expected_gap is not None else None
        ),
        "gapGrounded": (
            bool(task.gap.reason.strip())
            and any(step.verdict == "error" for step in task.steps)
            and card.expected_gap is not False
            if task and task.gap
            else None
        ),
        "dependentErrors": (
            max(0, sum(step.verdict == "error" for step in task.steps) - card.independent_errors)
            if task and card.independent_errors is not None
            else None
        ),
    }


def share(part: int, whole: int) -> float | None:
    return round(part / whole, 4) if whole else None


def percentile(values: list[int], level: float) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, math.ceil(level * len(ordered)) - 1)]


def task_totals(rows: list[dict]) -> dict:
    correct = [row for row in rows if row["expertCorrect"] is True]
    wrong = [row for row in rows if row["expertCorrect"] is False]
    recognized = [row["recognition"] for row in rows if row["recognition"] is not None]
    typed = [row["taskTypeMatch"] for row in rows if row.get("taskTypeMatch") is not None]
    quality = {}
    for key in ("transcriptionComplete", "gapPresenceMatch", "gapGrounded", "dependentErrors"):
        values = [row[key] for row in rows if row.get(key) is not None]
        quality[key] = sum(values) if key == "dependentErrors" else share(sum(values), len(values))
    return {
        "tasks": len(rows),
        **quality,
        "verdictMatch": share(sum(row["verdictMatch"] for row in rows), len(rows)),
        "firstErrorMatch": share(sum(row["firstErrorMatch"] for row in wrong), len(wrong)),
        "falseErrors": sum(row["falseError"] for row in correct),
        "correctSolutions": len(correct),
        "falseErrorShare": share(sum(row["falseError"] for row in correct), len(correct)),
        "refused": sum(row["refused"] for row in rows),
        "topicMatch": share(sum(row["topicMatch"] for row in rows), len(rows)),
        "taskTypeMatch": share(sum(typed), len(typed)),
        "recognition": round(sum(recognized) / len(recognized), 4) if recognized else None,
        "autoOk": share(
            sum(row["verdictMatch"] and row["firstErrorMatch"] for row in rows), len(rows)
        ),
    }


def run_totals(runs: list[tuple[RunRecord, str | None]]) -> dict:
    latencies = [
        (record.recognize_ms or 0) + (record.review_ms or 0)
        for record, error in runs
        if error is None
    ]
    cost = sum((record.cost for record, _ in runs), Decimal(0))
    return {
        "works": len(runs),
        "failedWorks": sum(error is not None for _, error in runs),
        "errors": dict(Counter(error for _, error in runs if error)),
        "latencyP50Ms": percentile(latencies, 0.5),
        "latencyP90Ms": percentile(latencies, 0.9),
        "inputTokens": sum(record.input_tokens for record, _ in runs),
        "outputTokens": sum(record.output_tokens for record, _ in runs),
        "cost": str(cost),
    }


def grouped(rows: list[dict], key: str) -> dict:
    groups = defaultdict(list)
    for row in rows:
        if row.get(key):
            groups[row[key]].append(row)
    return {name: task_totals(items) for name, items in sorted(groups.items())}


def summarize(rows: list[dict], runs: list[tuple[RunRecord, str | None]]) -> dict:
    return {
        "total": {**task_totals(rows), **run_totals(runs)},
        "families": grouped(rows, "family"),
        "taskTypes": grouped(rows, "taskType"),
        "scenarios": grouped(rows, "scenario"),
    }
