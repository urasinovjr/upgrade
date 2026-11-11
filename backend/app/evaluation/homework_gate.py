import argparse
import csv
import json
from pathlib import Path

from app.evaluation.manifest import admitted_tasks, load_manifest
from app.evaluation.metrics import IncompleteMarks, read_rows, scores_of
from app.evaluation.validate import MIN_CORRECT, MIN_TASKS, validate


def groups_of(rows: list[dict]) -> dict[str, list[dict]]:
    return {
        "geometry": [row for row in rows if row.get("family") == "geometry"],
        "other": [row for row in rows if row.get("family") != "geometry"],
    }


def group_problems(rows: list[dict]) -> list[str]:
    problems = []
    for name, group in groups_of(rows).items():
        scores = scores_of(group)
        if scores.tasks < MIN_TASKS or scores.correct_solutions < MIN_CORRECT:
            problems.append(f"{name}: нужно ≥{MIN_TASKS} задач и ≥{MIN_CORRECT} верных решений")
        if not scores.passed:
            problems.append(f"{name}: не пройдены пороги 90% верных разборов и 5% ложных ошибок")
    geometry_types = {row.get("task_type") for row in groups_of(rows)["geometry"]}
    if not {"geometry", "solid_geometry", "geometry_proof"} <= geometry_types:
        problems.append("geometry: нужны планиметрия, стереометрия и доказательства")
    return problems


def materials_problems(path: Path) -> list[str]:
    if not path.is_file():
        return ["нет независимой проверки объяснений, упражнений, ответов и решений"]
    with path.open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        return ["нет экспертной разметки материалов"]
    groups = {}
    problems = []
    for row in rows:
        material_id = row.get("material_id", "")
        groups.setdefault(material_id, set()).add(row.get("exercise"))
        if not material_id or not row.get("reviewer") or not row.get("sha256"):
            problems.append(
                "материал: нужны идентификатор, проверяющий и sha256 исходного материала"
            )
        if any(
            row.get(field) != "yes"
            for field in ("explanation_ok", "condition_ok", "answer_ok", "solution_ok")
        ):
            problems.append(f"{material_id}: материал не подтверждён экспертом")
    if any(exercises != {"1", "2", "3"} for exercises in groups.values()):
        problems.append("каждый материал должен включать три проверенных упражнения")
    return sorted(set(problems))


def acceptance_problems(root: Path, run: Path, materials: Path) -> list[str]:
    manifest = load_manifest(root)
    problems, _ = validate(manifest, root, [])
    meta = json.loads((run / "meta.json").read_text())
    if meta.get("split") != "acceptance" or meta.get("datasetVersion") != manifest.dataset_version:
        problems.append("прогон не соответствует приёмочной части набора")
    if meta.get("promptVersion") != "math-3" or meta.get("provider") == "provider-sim":
        problems.append("нужен прогон реального кандидата с промптом math-3")
    rows = read_rows(run)
    expected = {
        (work.work_id, task.task_id)
        for work in manifest.works
        if work.split == "acceptance"
        for task in admitted_tasks(work)
    }
    actual = {(row["work_id"], row["task_id"]) for row in rows}
    if expected != actual or len(actual) != len(rows):
        problems.append("экспертная оценка не покрывает приёмочный набор без повторов")
    problems += group_problems(rows)
    problems += materials_problems(materials)
    return problems


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--materials", type=Path, required=True)
    args = parser.parse_args()
    try:
        problems = acceptance_problems(args.root, args.run, args.materials)
    except (OSError, ValueError, KeyError, IncompleteMarks) as error:
        print(f"Приёмка не завершена: {error}")
        return 1
    if problems:
        print("Приёмка не завершена:\n" + "\n".join(problems))
        return 1
    print("Экспертные пороги пройдены в обеих группах. Материалы подтверждены.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
