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
    ("failedWorks", "Работ без ответа"),
    ("latencyP50Ms", "p50, мс"),
    ("latencyP90Ms", "p90, мс"),
    ("cost", "Стоимость"),
]


class AcceptanceRun(Exception):
    def __init__(self, out: Path):
        super().__init__(str(out))
        self.out = out


def read_run(out: Path) -> dict:
    meta = json.loads((out / "meta.json").read_text("utf-8"))
    if meta["split"] != "dev":
        raise AcceptanceRun(out)
    total = json.loads((out / "auto.json").read_text("utf-8"))["total"]
    return {
        "run": out.name,
        "variant": meta.get("variant", ""),
        "codeCommit": meta.get("codeCommit", ""),
        "datasetVersion": meta["datasetVersion"],
        "currency": meta.get("currency", ""),
        **total,
    }


def cell(value) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.1%}" if value <= 1 else f"{value:.0f}"
    return str(value)


def markdown(rows: list[dict]) -> str:
    lines = [
        "| " + " | ".join(title for _, title in COLUMNS) + " |",
        "|" + " --- |" * len(COLUMNS),
    ]
    for row in rows:
        lines.append("| " + " | ".join(cell(row.get(key)) for key, _ in COLUMNS) + " |")
    return "\n".join(lines)


def compare(outs: list[Path], report: Path) -> str:
    rows = [read_run(out) for out in outs]
    report.mkdir(parents=True, exist_ok=True)
    (report / "compare.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), "utf-8")
    with (report / "compare.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=[key for key, _ in COLUMNS])
        writer.writeheader()
        writer.writerows([{key: row.get(key) for key, _ in COLUMNS} for row in rows])
    table = markdown(rows)
    (report / "compare.md").write_text(table + "\n", "utf-8")
    versions = {row["datasetVersion"] for row in rows}
    if len(versions) > 1:
        table += "\nвнимание: прогоны сделаны на разных версиях набора: " + ", ".join(
            sorted(versions)
        )
    return table
