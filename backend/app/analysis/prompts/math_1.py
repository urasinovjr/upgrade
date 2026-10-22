import base64
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.analysis.contract import ReviewTask, TaskInput
from app.knowledge.topics import TOPICS
from app.redaction import PageImage

VERSION = "math-1"

RECOGNIZE_SYSTEM = """\
Ты переписываешь рукописные решения школьных задач по алгебре с фотографий страниц.
Для каждой задачи из списка найди на страницах её решение и перепиши его по шагам.

Правила:
1. Один шаг — одна строка преобразования или вывода в том виде, как её записал ученик.
   Не объединяй и не дели строки.
2. Записывай шаг в LaTeX точно как написано, даже если в нём ошибка.
   Не исправляй, не дописывай пропущенное и не решай задачу сам.
3. Если фрагмент нельзя прочитать уверенно, запиши лучший вариант и поставь legible: false.
4. page_number — номер страницы из подписи «Страница N».
   bbox — прямоугольник шага [x1, y1, x2, y2] в долях от 0 до 1000
   от ширины и высоты этой страницы. Если место не определить, оба поля null.
5. Если решения задачи на страницах нет или непонятно, к какой задаче оно относится,
   поставь matched: false и оставь steps пустым.
6. Области, закрашенные чёрным, скрыты намеренно. Не пытайся их прочитать.

Ответь только JSON по заданной схеме."""

REVIEW_SYSTEM = """\
Ты опытный учитель математики и проверяешь ход решения ученика по алгебре 9–11 классов.
Тебе дают условие, необязательный эталон и распознанные шаги решения с идентификаторами.

Для каждой задачи:
1. В reasoning кратко проверь каждый переход от предыдущего шага к следующему:
   допустимо ли преобразование и соблюдены ли ограничения — область допустимых значений,
   смена знака неравенства, потерянные и посторонние корни.
2. Поставь каждому шагу verdict:
   correct — шаг верно следует из условия и предыдущих шагов;
   error — в шаге ошибка ученика; в explanation назови нарушенное правило коротко
   и понятно ученику;
   uncertain — судить нельзя: шаг плохо распознан или данных не хватает.
3. error ставь только первому неверному переходу. Шаги, которые верно продолжают
   уже ошибочное решение, отмечай correct и не считай новыми ошибками.
4. Верный ответ не доказывает верность решения. Отличие от эталона само по себе
   не ошибка: другой правильный способ решения допустим.
5. Не ищи ошибки в верном решении. Если ошибок нет, все шаги correct.
6. topic_id — тема задачи из справочника. Если есть ошибка, gap — гипотеза о пробеле:
   тема из справочника, которую ученик, вероятно, не усвоил, и reason с основанием.
   Если ошибки нет, gap: null.
7. feedback — одно-три предложения для ученика: итог и что повторить.
8. Если condition_is_image: true, условие дано изображением и здесь не приводится.
   Восстанови задачу по шагам решения и не отказывайся от разбора только из-за этого.
9. Если задача вне алгебры 9–11 классов (производные, вероятность, геометрия,
   текстовые задачи) или её нельзя проверить без условия, поставь supported: false,
   в reason укажи причину, steps оставь пустым.

Пиши по-русски. Ответь только JSON по заданной схеме."""


class Answer(BaseModel):
    model_config = ConfigDict(extra="forbid")


class StepAnswer(Answer):
    latex: str
    legible: bool
    page_number: int | None
    bbox: list[float] | None


class TaskAnswer(Answer):
    task_id: str
    matched: bool
    steps: list[StepAnswer]


class RecognitionAnswer(Answer):
    tasks: list[TaskAnswer]


class VerdictAnswer(Answer):
    id: str
    verdict: Literal["correct", "error", "uncertain"]
    explanation: str


class GapAnswer(Answer):
    topic_id: str
    reason: str


class ReviewedTaskAnswer(Answer):
    task_id: str
    reasoning: str
    supported: bool
    reason: str
    topic_id: str
    steps: list[VerdictAnswer]
    gap: GapAnswer | None
    feedback: str


class ReviewAnswer(Answer):
    tasks: list[ReviewedTaskAnswer]


def data_url(page: PageImage) -> str:
    return f"data:{page.content_type};base64,{base64.b64encode(page.data).decode()}"


def condition_pages(task: TaskInput, pages: list[PageImage]) -> list[int]:
    return [
        number
        for number, page in enumerate(pages, start=1)
        if page.file_id in task.condition_file_ids
    ]


def task_text(task: TaskInput, pages: list[PageImage]) -> str:
    lines = [f"Задача {task.id}"]
    if task.condition.strip():
        lines.append(f"Условие: {task.condition.strip()}")
    if task.formula.strip():
        lines.append(f"Формула условия: {task.formula.strip()}")
    numbers = condition_pages(task, pages)
    if numbers:
        lines.append("Условие на страницах: " + ", ".join(str(number) for number in numbers))
    return "\n".join(lines)


def recognize_messages(pages: list[PageImage], tasks: list[TaskInput]) -> list[dict]:
    content: list[dict] = []
    for number, page in enumerate(pages, start=1):
        content.append({"type": "text", "text": f"Страница {number}"})
        content.append({"type": "image_url", "image_url": {"url": data_url(page)}})
    listing = "\n\n".join(task_text(task, pages) for task in tasks)
    content.append({"type": "text", "text": f"Задачи:\n\n{listing}"})
    return [
        {"role": "system", "content": RECOGNIZE_SYSTEM},
        {"role": "user", "content": content},
    ]


def topic_text() -> str:
    lines = []
    for topic in TOPICS:
        needs = ", ".join(topic.prerequisites) or "нет"
        lines.append(f"{topic.id} — {topic.name} (опирается на: {needs})")
    return "\n".join(lines)


def review_payload(task: ReviewTask) -> dict:
    return {
        "task_id": task.id,
        "condition": task.condition,
        "formula": task.formula,
        "condition_is_image": bool(task.condition_file_ids),
        "reference": task.reference,
        "steps": [step.model_dump() for step in task.steps],
    }


def review_messages(tasks: list[ReviewTask]) -> list[dict]:
    payload = json.dumps([review_payload(task) for task in tasks], ensure_ascii=False, indent=1)
    text = f"Справочник тем:\n{topic_text()}\n\nЗадачи:\n{payload}"
    return [
        {"role": "system", "content": REVIEW_SYSTEM},
        {"role": "user", "content": text},
    ]
