import ast
import json
import re
from pathlib import Path

import pytest

from app.analysis.quality import RETRY_REASONS, WARNINGS, retry_reason, warning

ROOT = Path(__file__).resolve().parents[2]
LEGACY_REASONS = {
    "incomplete_recognition": "Распознавание неполное: сверьте все строки и продолжение ответа.",
    "task_ids": "Ответ ИИ содержит несогласованные номера задач. Сверьте разбор с оригиналом.",
    "step_ids": "Ответ ИИ содержит несогласованные номера шагов. Сверьте вердикты с оригиналом.",
    "page_ids": "Привязка шагов к страницам расходится с файлами задания. Сверьте шаги вручную.",
    "gap_conflict": "Вердикт и обоснование пробела противоречат друг другу. Сверьте гипотезу.",
    "schema": "Ответ ИИ повреждён. Доступные строки сохранены для ручной сверки.",
}


def test_frontend_and_backend_publication_blockers_match():
    backend = ROOT / "backend/app/works/review.py"
    tree = ast.parse(backend.read_text())
    functions = [
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name in {"task_problems", "review_blockers"}
    ]
    server = {
        node.value
        for function in functions
        for node in ast.walk(function)
        if isinstance(node, ast.Constant)
        and isinstance(node.value, str)
        and re.search("[а-яё]", node.value)
    }
    client = (ROOT / "frontend/src/domain/review.ts").read_text()
    client = client[
        client.index("export const unreviewedBlocker") : client.index("export function publishWork")
    ]
    browser = {
        json.loads(value)
        for value in re.findall(r'"(?:[^"\\]|\\.)*"', client)
        if re.search("[а-яё]", value)
    }
    assert server == browser
    assert all(not value.endswith(".") for value in server)


@pytest.mark.parametrize("reason", [*LEGACY_REASONS, "unknown"])
def test_quality_retry_instructions_keep_the_previous_text(reason):
    fallback = "Разбор не прошёл проверку качества. Сверьте задачу вручную."
    assert retry_reason(reason) == LEGACY_REASONS.get(reason, fallback)
    assert not warning(reason).endswith(".")
    assert warning(reason) != retry_reason(reason)


def test_ui_quality_warnings_cover_every_retry_reason():
    assert WARNINGS.keys() == RETRY_REASONS.keys() == LEGACY_REASONS.keys()


def test_recovery_messages_follow_ui_punctuation():
    source = (ROOT / "backend/app/analysis/quality.py").read_text()
    functions = [
        node
        for node in ast.parse(source).body
        if isinstance(node, ast.FunctionDef)
        and node.name in {"warning", "recover_recognition", "recover_review"}
    ]
    messages = [
        node.value
        for function in functions
        for node in ast.walk(function)
        if isinstance(node, ast.Constant)
        and isinstance(node.value, str)
        and re.search("[А-Яа-яЁё]", node.value)
    ]
    assert messages
    assert all(not value.endswith(".") for value in messages)
