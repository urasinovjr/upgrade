import csv
import json
from collections import defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path

from app.evaluation.validate import MIN_CORRECT, MIN_TASKS

CORRECT_SHARE = 0.90
FALSE_ERROR_SHARE = 0.05
MARKS = ("yes", "no")


class IncompleteMarks(Exception):
    def __init__(self, rows: list[str]):
        super().__init__(", ".join(rows))
        self.rows = rows


@dataclass
class Scores:
    tasks: int
    correct_reviews: int
    correct_solutions: int
    false_errors: int

    @property
    def correct_share(self) -> float | None:
        return self.correct_reviews / self.tasks if self.tasks else None

    @property
    def false_error_share(self) -> float | None:
        return self.false_errors / self.correct_solutions if self.correct_solutions else None

    @property
    def passed(self) -> bool:
        correct = self.correct_share
        false = self.false_error_share
        return (
            correct is not None
            and correct >= CORRECT_SHARE
            and false is not None
            and false <= FALSE_ERROR_SHARE
        )


def read_rows(out: Path) -> list[dict]:
    with (out / "expert.csv").open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    missing = [
        f"{row['work_id']}/{row['task_id']}"
        for row in rows
        if row["explanation_ok"] not in MARKS or row["recognition_ok"] not in MARKS
    ]
    if missing:
        raise IncompleteMarks(missing)
    return rows


def review_is_correct(row: dict) -> bool:
    expected = "correct" if row["expert_correct"] == "yes" else "error"
    return (
        row["refused"] == "no"
        and row["ai_verdict"] == expected
        and (expected == "correct" or row["first_error_match"] == "yes")
        and row["explanation_ok"] == "yes"
        and row["recognition_ok"] == "yes"
    )


def scores_of(rows: list[dict]) -> Scores:
    correct_solutions = [row for row in rows if row["expert_correct"] == "yes"]
    return Scores(
        tasks=len(rows),
        correct_reviews=sum(review_is_correct(row) for row in rows),
        correct_solutions=len(correct_solutions),
        false_errors=sum(row["ai_verdict"] == "error" for row in correct_solutions),
    )


def share(value: float | None) -> str:
    return "нет данных" if value is None else f"{value:.1%}"


def scores_line(title: str, scores: Scores) -> str:
    return (
        f"{title}: верные разборы {scores.correct_reviews}/{scores.tasks} "
        f"({share(scores.correct_share)}), ложные ошибки "
        f"{scores.false_errors}/{scores.correct_solutions} ({share(scores.false_error_share)})"
    )


def grouped_scores(rows: list[dict], key: str) -> dict[str, Scores]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        if row.get(key):
            groups[row[key]].append(row)
    return {name: scores_of(items) for name, items in sorted(groups.items())}


def score(out: Path) -> str:
    rows = read_rows(out)
    meta = json.loads((out / "meta.json").read_text("utf-8"))
    total = scores_of(rows)
    families = grouped_scores(rows, "family")
    types = grouped_scores(rows, "task_type")
    verdict = "порог пройден" if total.passed else "порог не пройден"
    lines = [
        f"Набор {meta['datasetVersion']}, часть {meta['split']}, модель {meta['model']}, "
        f"промпт {meta['promptVersion']}, справочник "
        f"{meta.get('catalogVersion', '')} {meta['topicsHash']}".replace("  ", " "),
        scores_line("Всего", total),
        f"Пороги: верных разборов не меньше {CORRECT_SHARE:.0%}, ложных ошибок не больше "
        f"{FALSE_ERROR_SHARE:.0%} — {verdict}",
        *[scores_line(name, item) for name, item in families.items()],
        *[scores_line("тип " + name, item) for name, item in types.items()],
    ]
    if total.tasks < MIN_TASKS or total.correct_solutions < MIN_CORRECT:
        lines.append(
            f"Внимание: для приёмки нужно {MIN_TASKS} задач и {MIN_CORRECT} верных решений"
        )
    result = {
        "total": {**asdict(total), "passed": total.passed},
        "families": {name: asdict(item) for name, item in families.items()},
        "taskTypes": {name: asdict(item) for name, item in types.items()},
    }
    (out / "metrics.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), "utf-8")
    return "\n".join(lines)
