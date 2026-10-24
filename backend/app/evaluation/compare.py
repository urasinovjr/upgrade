import csv
import json
from pathlib import Path

COLUMNS = [
    ("run", "Прогон"),
    ("variant", "Вариант"),
    ("codeCommit", "Коммит"),
    ("tasks", "Задач"),
    ("autoOk", "Вердикт и первая ошибка"),
    ("verdictMatch", "Вердикт"),
    ("firstErrorMatch", "Первая ошибка"),
    ("falseErrorShare", "Ложные ошибки"),
    ("refused", "Отказы"),
    ("recognition", "Распознавание"),
    ("topicMatch", "Тема"),
    ("taskTypeMatch", "Тип задачи"),
    ("failedWorks", "Работ без ответа"),
    ("latencyP50Ms", "p50, мс"),
    ("latencyP90Ms", "p90, мс"),
    ("cost", "Стоимость"),
]


SCENARIO_COLUMNS = [
    ("run", "Прогон"),
    ("scenario", "Сценарий"),
    ("tasks", "Задач"),
    ("verdictMatch", "Вердикт"),
    ("firstErrorMatch", "Первая ошибка"),
    ("falseErrorShare", "Ложные ошибки"),
    ("refused", "Отказы"),
]


class AcceptanceRun(Exception):
    def __init__(self, out: Path):
        super().__init__(str(out))
        self.out = out


def read_run(out: Path) -> dict:
    meta = json.loads((out / "meta.json").read_text("utf-8"))
    if meta["split"] != "dev":
        raise AcceptanceRun(out)
    auto = json.loads((out / "auto.json").read_text("utf-8"))
    total = auto["total"]
    return {
        "scenarios": auto.get("scenarios", {}),
        "run": out.name,
        "variant": meta.get("variant", ""),
        "codeCommit": meta.get("codeCommit", ""),
        "datasetVersion": meta["datasetVersion"],
        "catalog": meta.get("catalogVersion") or meta.get("topicsHash", ""),
        "currency": meta.get("currency", ""),
        **total,
    }


def cell(value) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.1%}" if value <= 1 else f"{value:.0f}"
    return str(value)


def markdown(rows: list[dict], columns: list[tuple[str, str]] = COLUMNS) -> str:
    lines = [
        "| " + " | ".join(title for _, title in columns) + " |",
        "|" + " --- |" * len(columns),
    ]
    for row in rows:
        lines.append("| " + " | ".join(cell(row.get(key)) for key, _ in columns) + " |")
    return "\n".join(lines)


def scenario_rows(rows: list[dict]) -> list[dict]:
    return [
        {"run": row["run"], "scenario": name, **totals}
        for row in rows
        for name, totals in row["scenarios"].items()
    ]


def compare(outs: list[Path], report: Path) -> str:
    rows = [read_run(out) for out in outs]
    report.mkdir(parents=True, exist_ok=True)
    (report / "compare.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), "utf-8")
    with (report / "compare.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=[key for key, _ in COLUMNS])
        writer.writeheader()
        writer.writerows([{key: row.get(key) for key, _ in COLUMNS} for row in rows])
    table = markdown(rows)
    by_scenario = scenario_rows(rows)
    if by_scenario:
        table += "\n\nПо сценариям:\n\n" + markdown(by_scenario, SCENARIO_COLUMNS)
    (report / "compare.md").write_text(table + "\n", "utf-8")
    versions = {row["datasetVersion"] for row in rows}
    if len(versions) > 1:
        table += "\nвнимание: прогоны сделаны на разных версиях набора: " + ", ".join(
            sorted(versions)
        )
    catalogs = {row["catalog"] for row in rows}
    if len(catalogs) > 1:
        table += "\nвнимание: прогоны сделаны с разными справочниками тем: " + ", ".join(
            sorted(catalogs)
        )
    return table
