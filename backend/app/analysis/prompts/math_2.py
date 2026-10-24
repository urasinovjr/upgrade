import json
from typing import Literal

from app.analysis.contract import ConditionImage, ReviewTask, TaskInput
from app.analysis.prompts import math_1
from app.knowledge.families import FAMILY_NAMES
from app.knowledge.task_types import TASK_TYPES
from app.knowledge.topics import TOPICS
from app.redaction import PageImage

VERSION = "math-2"
Answer = math_1.Answer
RecognitionAnswer = math_1.RecognitionAnswer
data_url = math_1.data_url

RECOGNIZE_SYSTEM = """\
Ты переписываешь рукописные решения школьных задач по алгебре и тригонометрии
с фотографий страниц. Для каждой задачи из списка найди на страницах её решение
и перепиши его по шагам.

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
7. Если у задачи указана «Область условия», там записано условие, а не решение.
   Не включай её содержимое в шаги.

Ответь только JSON по заданной схеме."""

REVIEW_SYSTEM = """\
Ты опытный учитель математики и проверяешь ход решения ученика по алгебре 9–11 классов,
включая тригонометрию. Тебе дают условие, необязательный эталон, распознанные шаги
решения с идентификаторами, справочник тем и справочник типов задач.

Для каждой задачи:
1. В reasoning кратко проверь каждый переход от предыдущего шага к следующему:
   допустимо ли преобразование и соблюдены ли ограничения — область допустимых значений,
   смена знака неравенства, потерянные и посторонние корни, серии корней
   тригонометрических уравнений и отбор корней на промежутке.
2. Поставь каждому шагу verdict:
   correct — шаг верно следует из условия и предыдущих шагов;
   error — в шаге ошибка ученика; в explanation назови нарушенное правило;
   uncertain — судить нельзя: шаг плохо распознан или данных не хватает.
3. error ставь только первому неверному переходу. Шаги, которые верно продолжают
   уже ошибочное решение, отмечай correct и не считай новыми ошибками.
4. Верный ответ не доказывает верность решения. Отличие от эталона само по себе
   не ошибка: другой правильный способ решения допустим.
5. Не ищи ошибки в верном решении. Если ошибок нет, все шаги correct.
6. task_type_id — тип задачи из справочника типов. Если подходящего типа нет,
   оставь пустую строку. Если тип отмечен «вне охвата», поставь supported: false,
   в reason назови тип задачи, steps оставь пустым.
7. topic_id — тема задачи из справочника тем. Если есть ошибка, gap — гипотеза о пробеле:
   тема из справочника, которую ученик, вероятно, не усвоил, и reason с основанием.
   Предпочитай предварительную тему, если ошибка в ней, а не в самой теме задачи.
   Если ошибки нет, gap: null.
8. Если condition_is_image: true, условие дано изображением. Изображения приложены
   после списка задач с подписью «Условие задачи <task_id>». Прочитай условие с них.
   Если условие не читается и задачу нельзя проверить, поставь supported: false
   и в reason попроси уточнить условие.
9. explanation и feedback пишутся для ученика от лица репетитора: на «вы» или безлично,
   спокойно и по делу, без оценок, баллов и восклицательных знаков.
   Не упоминай ИИ, распознавание и фотографию. Не используй LaTeX в тексте пояснений:
   формулы записывай обычными символами.
10. feedback — одно-три предложения: итог и что повторить.

Пиши по-русски. Ответь только JSON по заданной схеме."""


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
    task_type_id: str
    supported: bool
    reason: str
    topic_id: str
    steps: list[VerdictAnswer]
    gap: GapAnswer | None
    feedback: str


class ReviewAnswer(Answer):
    tasks: list[ReviewedTaskAnswer]


def area_text(task: TaskInput, pages: list[PageImage]) -> str | None:
    area = task.condition_region
    if area is None:
        return None
    numbers = [
        number
        for number, page in enumerate(pages, start=1)
        if (page.file_id, page.page) == (area.file_id, area.page)
    ]
    if not numbers:
        return None
    box = area.region
    corners = [box.x, box.y, box.x + box.width, box.y + box.height]
    scaled = ", ".join(str(round(value * 1000)) for value in corners)
    return f"Область условия: страница {numbers[0]}, bbox [{scaled}]"


def task_text(task: TaskInput, pages: list[PageImage]) -> str:
    lines = [f"Задача {task.id}"]
    if task.condition.strip():
        lines.append(f"Условие: {task.condition.strip()}")
    if task.formula.strip():
        lines.append(f"Формула условия: {task.formula.strip()}")
    numbers = [
        number
        for number, page in enumerate(pages, start=1)
        if page.file_id in task.condition_file_ids
    ]
    if numbers:
        lines.append("Условие на страницах: " + ", ".join(str(number) for number in numbers))
    area = area_text(task, pages)
    if area:
        lines.append(area)
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
    for family, name in FAMILY_NAMES.items():
        topics = [topic for topic in TOPICS if topic.family == family]
        if not topics:
            continue
        lines.append(f"{name}:")
        for topic in topics:
            needs = ", ".join(topic.prerequisites) or "нет"
            lines.append(f"  {topic.id} — {topic.name} (опирается на: {needs})")
    return "\n".join(lines)


def type_text() -> str:
    lines = []
    for item in TASK_TYPES:
        scope = "" if item.in_scope else " — вне охвата"
        lines.append(f"{item.id} — {item.name}{scope}")
    return "\n".join(lines)


def review_payload(task: ReviewTask, conditions: list[ConditionImage]) -> dict:
    return {
        "task_id": task.id,
        "condition": task.condition,
        "formula": task.formula,
        "condition_is_image": any(item.task_id == task.id for item in conditions),
        "reference": task.reference,
        "steps": [step.model_dump() for step in task.steps],
    }


def review_messages(tasks: list[ReviewTask], conditions: list[ConditionImage]) -> list[dict]:
    payload = json.dumps(
        [review_payload(task, conditions) for task in tasks], ensure_ascii=False, indent=1
    )
    text = (
        f"Справочник тем:\n{topic_text()}\n\nСправочник типов задач:\n{type_text()}"
        f"\n\nЗадачи:\n{payload}"
    )
    content: list[dict] = [{"type": "text", "text": text}]
    for item in conditions:
        content.append({"type": "text", "text": f"Условие задачи {item.task_id}"})
        content.append({"type": "image_url", "image_url": {"url": data_url(item.image)}})
    return [
        {"role": "system", "content": REVIEW_SYSTEM},
        {"role": "user", "content": content},
    ]
