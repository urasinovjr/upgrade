import json
from pathlib import Path

from openpyxl import load_workbook

from app.analysis import contract
from app.analysis.contract import ReviewTask, read_review
from app.knowledge import catalog
from app.knowledge.catalog import (
    LEGACY_TOPICS,
    catalog_hash,
    catalog_payload,
    catalog_problems,
    cycle_topics,
)
from app.knowledge.export import catalog_diff, write_catalog_xlsx
from app.knowledge.task_types import OUT_OF_SCOPE_TYPES
from app.knowledge.topics import TOPIC_IDS
from tests.students import create_student

FRONTEND_CATALOG = Path(__file__).resolve().parents[2] / "frontend/src/data/catalog.json"


def test_catalog_is_consistent_and_keeps_legacy_topics():
    assert catalog_problems() == []
    assert set(LEGACY_TOPICS) <= TOPIC_IDS
    assert {"derivative", "geometry"} <= OUT_OF_SCOPE_TYPES


def test_alias_problems_are_reported():
    problems = catalog_problems({"logs": "powers", "old_roots": "missing"})

    assert "алиас logs совпадает с темой" in problems
    assert "алиас old_roots ведёт к неизвестной теме missing" in problems


def test_cycles_in_links_are_found():
    assert cycle_topics({"a": ("b",), "b": ("a",), "c": ()}) != []
    assert cycle_topics({"a": ("b",), "b": (), "c": ("a", "b")}) == []


def test_frontend_copy_matches_backend_catalog():
    assert json.loads(FRONTEND_CATALOG.read_text("utf-8")) == catalog_payload()


def test_catalog_hash_is_stable_and_follows_content(monkeypatch):
    first = catalog_hash()
    assert catalog_hash() == first

    monkeypatch.setattr(catalog, "CATALOG_VERSION", "algebra-test")

    assert catalog_hash() != first


def test_unchanged_workbook_has_no_edits(tmp_path):
    path = tmp_path / "catalog.xlsx"
    write_catalog_xlsx(path)

    assert catalog_diff(path) == []


def test_expert_edits_and_notes_are_listed(tmp_path):
    path = tmp_path / "catalog.xlsx"
    write_catalog_xlsx(path)
    book = load_workbook(path)
    topics = book["Темы"]
    topics.cell(3, 2, "Обыкновенные дроби")
    topics.cell(3, 7, "Добавить десятичные")
    book["Связи"].append(["logs", "fractions", ""])
    book.save(path)

    lines = catalog_diff(path)

    assert "тема fractions, Название: «Дроби» → «Обыкновенные дроби»" in lines
    assert "добавлена связь logs → fractions" in lines
    assert "замечание: тема fractions: Добавить десятичные" in lines


def test_review_accepts_alias_and_stores_current_topic(monkeypatch):
    monkeypatch.setitem(catalog.ALIASES, "old_logs", "logs")
    monkeypatch.setattr(contract, "KNOWN_TOPICS", TOPIC_IDS | {"old_logs"})
    tasks = [
        ReviewTask(id="t1", condition="", formula="", reference="", condition_file_ids=[], steps=[])
    ]
    raw = {
        "tasks": [
            {
                "task_id": "t1",
                "supported": True,
                "topic_id": "old_logs",
                "steps": [],
                "gap": {"topic_id": "old_logs", "reason": "Свойства логарифма"},
            }
        ]
    }

    review = read_review(raw, tasks)

    assert review.tasks[0].topic_id == "logs"
    assert review.tasks[0].gap.topic_id == "logs"


async def test_closing_unknown_topic_is_rejected(teacher):
    student_id = await create_student(teacher)

    response = await teacher.post(
        f"/api/students/{student_id}/closures",
        json={"topicId": "calculus", "action": "close", "note": "Решила"},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "topic_unknown"}


async def test_state_reports_catalog_version(teacher):
    state = await teacher.get("/api/state")

    assert state.json()["catalogVersion"] == catalog.CATALOG_VERSION
