import csv
import json
from pathlib import Path

import pytest

from app.cli import run
from app.config import Settings
from app.evaluation import IncompleteMarks, load_manifest, run_split, score, validate
from tests.fakes import FakeDraftProvider
from tests.samples import PNG_BYTES, picture

NAME_MASK = {"x": 0, "y": 0, "width": 0.5, "height": 0.2}


def card(task_id: str, correct: bool, **changes) -> dict:
    data = {
        "taskId": task_id,
        "family": "equations",
        "condition": "Решите уравнение x^2 = 4",
        "transcription": ["x^2=4", "x=\\pm 2"],
        "correct": correct,
        "topicId": "equations",
    }
    if not correct:
        data |= {"firstErrorStep": 2, "explanation": "Потерян корень."}
    return {**data, **changes}


def work(work_id: str, split: str, group: str, path: str, tasks: list[dict]) -> dict:
    file = {"path": path, "masks": {"1": [NAME_MASK]}}
    return {
        "workId": work_id,
        "split": split,
        "solutionGroup": group,
        "files": [file],
        "tasks": tasks,
    }


def dataset(root: Path, works: list[dict], files: dict[str, bytes]) -> Path:
    for name, data in files.items():
        (root / name).write_bytes(data)
    manifest = {"datasetVersion": "test-1", "works": works}
    (root / "manifest.json").write_text(json.dumps(manifest), "utf-8")
    return root


@pytest.fixture
def clean_set(tmp_path: Path) -> Path:
    works = [
        work("w1", "dev", "g1", "w1.png", [card("t1", True)]),
        work(
            "w2",
            "acceptance",
            "g2",
            "w2.png",
            [
                card("t1", True),
                card("t2", False),
                card("t3", True, admission="excluded", exclusionReason="нечитаемо"),
            ],
        ),
    ]
    return dataset(tmp_path, works, {"w1.png": picture("PNG"), "w2.png": picture("PNG")})


def test_clean_set_passes_with_size_warnings(clean_set: Path):
    problems, warnings = validate(load_manifest(clean_set), clean_set, ["Мария"])

    assert problems == []
    assert warnings == [
        "в acceptance допущено задач: 2, нужно 100",
        "в acceptance верных решений: 1, нужно 50",
    ]


def test_validation_finds_leaks_and_gaps(tmp_path: Path):
    works = [
        work("w1", "dev", "g1", "Мария.png", [card("t1", True)]),
        work("w2", "acceptance", "g1", "w2.png", [card("t1", False, firstErrorStep=None)]),
        work("w3", "acceptance", "g3", "w3.png", [card("t1", True, topicId="calculus")]),
    ]
    files = {"Мария.png": picture("PNG"), "w2.png": PNG_BYTES, "w3.png": picture("PNG")}
    root = dataset(tmp_path, works, files)

    problems, _ = validate(load_manifest(root), root, ["Мария"])

    assert "решение g1 попала и в dev, и в acceptance" in problems
    assert "w1: имя ученика в названии файла Мария.png" in problems
    assert "w2: в w2.png остались метаданные" in problems
    assert "w2/t1: первый ошибочный шаг вне транскрипции" in problems
    assert "w3/t1: тема 'calculus' не из справочника" in problems


async def test_run_saves_replies_and_compares_with_the_expert(
    clean_set: Path, tmp_path: Path, test_settings
):
    out = tmp_path / "run"
    provider = FakeDraftProvider()

    message = await run_split(
        load_manifest(clean_set), clean_set, "acceptance", out, provider, test_settings
    )
    with (out / "expert.csv").open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    meta = json.loads((out / "meta.json").read_text("utf-8"))
    run = json.loads((out / "runs" / "w2.json").read_text("utf-8"))
    [(pages, tasks)] = provider.recognized

    assert "задач 2" in message
    assert [(row["task_id"], row["ai_verdict"], row["first_error_match"]) for row in rows] == [
        ("t1", "correct", "yes"),
        ("t2", "correct", "no"),
    ]
    assert rows[0]["topic_match"] == "yes"
    assert [task.id for task in tasks] == ["t1", "t2"]
    assert len(pages) == 1 and pages[0].data != picture("PNG")
    assert (meta["datasetVersion"], meta["split"], meta["model"]) == (
        "test-1",
        "acceptance",
        "fake-model",
    )
    assert run["error"] is None and run["review"]["tasks"][0]["task_id"] == "t1"


def mark(out: Path, explanation: list[str], recognition: list[str]) -> None:
    path = out / "expert.csv"
    with path.open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    for row, explained, recognized in zip(rows, explanation, recognition, strict=True):
        row["explanation_ok"] = explained
        row["recognition_ok"] = recognized
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


async def test_score_needs_every_mark_and_counts_false_errors(
    clean_set: Path, tmp_path: Path, test_settings
):
    out = tmp_path / "run"
    await run_split(
        load_manifest(clean_set), clean_set, "acceptance", out, FakeDraftProvider(), test_settings
    )

    with pytest.raises(IncompleteMarks):
        score(out)
    mark(out, ["yes", "no"], ["yes", "yes"])
    report = score(out)
    metrics = json.loads((out / "metrics.json").read_text("utf-8"))

    assert "Всего: верные разборы 1/2 (50.0%), ложные ошибки 0/1 (0.0%)" in report
    assert "порог не пройден" in report
    assert "Внимание: для приёмки нужно 100 задач и 50 верных решений" in report
    assert metrics["total"]["passed"] is False
    assert metrics["families"]["equations"]["tasks"] == 2


async def test_cli_checks_the_set_without_a_database(clean_set: Path, tmp_path: Path):
    names = tmp_path / "names.txt"
    names.write_text("Мария\n", "utf-8")
    settings = Settings(database_url="postgresql+asyncpg://nobody@127.0.0.1:1/none")

    report = await run(["eval-validate", "--root", str(clean_set), "--names", str(names)], settings)

    assert report.endswith("набор готов к прогону")
    assert "внимание: в acceptance допущено задач: 2, нужно 100" in report
