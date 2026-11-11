import json
from typing import Literal

from app.analysis.contract import ReviewTask, TaskInput
from app.analysis.prompts import math_1, math_2, math_3
from app.redaction import PageImage

VERSION = "math-4"

RECOGNIZE_SYSTEM = (
    math_3.RECOGNIZE_SYSTEM
    + """
Сохрани ВСЕ видимые строки: продолжение ответа, отдельные корни, строки у нижнего
края и продолжение на другой странице. Перед завершением сверь последнюю строку
каждой страницы с транскрипцией. Не обрывай ответ после первого корня.
latex содержит смешанный текст: русский текст оставляй обычным текстом с пробелами,
математические фрагменты заключай в $...$. Не помещай целое рассуждение в математику.
Для каждой задачи complete=true означает, что все видимые строки сохранены.
complete=false означает пропуск или невозможность проверить полноту; в issues
перечисли конкретные проблемы, не выдумывая нечитаемые строки.
Отсутствие решения при явно пустом списке файлов не является пропуском распознавания.
"""
)

REVIEW_SYSTEM = (
    math_3.REVIEW_SYSTEM
    + """
gap_assessment имеет ровно три значения:
proposed — есть содержательная ошибка и обоснованная гипотеза gap;
not_evidenced — оснований для гипотезы нет; gap=null;
insufficient_data — данных недостаточно; gap=null.
gap_reason обязательно объясняет выбранное значение. Если есть error, предложи
gap либо конкретно объясни его отсутствие (например, единичная описка при верном
способе решения). Нечитаемость, отсутствие решения и описка сами по себе не пробел.
Не подменяй гипотезу общим советом «повторить тему»: укажи ошибку и нарушенное правило.
Потерянный корень — содержательная ошибка, если он не восстановлен ниже.
Сначала проверь весь ответ, включая продолжение. Потерянный корень и неполный
ответ вследствие этой потери — одна ошибка. Для зависимого шага укажи
consequence_of=id первого ошибочного шага и verdict=correct, объяснив зависимость.
Независимый шаг имеет consequence_of=null. Не считай следствия новыми ошибками.
Для всех шагов без читаемого основания используй uncertain.
"""
)


class RecognizedTaskAnswer(math_1.Answer):
    task_id: str
    matched: bool
    steps: list[math_1.StepAnswer]
    complete: bool
    issues: list[str]


class RecognitionAnswer(math_1.Answer):
    tasks: list[RecognizedTaskAnswer]


class VerdictAnswer(math_2.VerdictAnswer):
    consequence_of: str | None


class ReviewedTaskAnswer(math_1.Answer):
    task_id: str
    supported: bool
    reason: str
    topic_id: str
    task_type_id: str
    steps: list[VerdictAnswer]
    gap: math_2.GapAnswer | None
    gap_assessment: Literal["proposed", "not_evidenced", "insufficient_data"]
    gap_reason: str
    feedback: str


class ReviewAnswer(math_1.Answer):
    tasks: list[ReviewedTaskAnswer]


def recognize_messages(pages: list[PageImage], tasks: list[TaskInput]) -> list[dict]:
    content = [
        {
            "type": "text",
            "text": "Задачи:\n"
            + json.dumps([task.model_dump() for task in tasks], ensure_ascii=False),
        }
    ]
    for number, page in enumerate(pages, 1):
        content.append(
            {"type": "text", "text": f"Страница {number}: файл {page.file_id}, лист {page.page}"}
        )
        content.append({"type": "image_url", "image_url": {"url": math_2.data_url(page)}})
    return [{"role": "system", "content": RECOGNIZE_SYSTEM}, {"role": "user", "content": content}]


def review_messages(tasks: list[ReviewTask], conditions: list) -> list[dict]:
    messages = math_3.review_messages(tasks, conditions)
    messages[0]["content"] = REVIEW_SYSTEM
    return messages
