import re

from app.analysis.contract import ReviewTask
from app.works.schemas import Task

WORD = re.compile(r"[a-zа-яё]+", re.IGNORECASE)
ENDINGS = "аеиоуыэюяйь"
INFLECTION = re.compile(r"[аеиоуыэюяйьмвх]{0,3}")
HIDDEN = "[скрыто]"
TEXT_FIELDS = ("condition", "formula", "reference")


def normalized(word: str) -> str:
    return word.lower().replace("ё", "е")


def name_stems(name: str) -> list[str]:
    stems = []
    for word in WORD.findall(name):
        word = normalized(word)
        if len(word) < 3:
            continue
        stems.append(word[:-1] if word[-1] in ENDINGS and len(word) > 3 else word)
    return stems


def is_name(word: str, stems: list[str]) -> bool:
    word = normalized(word)
    return any(word.startswith(stem) and INFLECTION.fullmatch(word[len(stem) :]) for stem in stems)


def mentions(name: str, text: str) -> bool:
    stems = name_stems(name)
    return any(is_name(word, stems) for word in WORD.findall(text))


def name_places(name: str, tasks: list[Task]) -> list[dict]:
    places = []
    for task in tasks:
        for field in TEXT_FIELDS:
            if mentions(name, getattr(task, field)):
                places.append({"taskId": task.id, "field": field})
        for step in task.steps:
            if mentions(name, step.latex):
                places.append({"taskId": task.id, "field": "step", "stepId": step.id})
    return places


def hidden_text(text: str, stems: list[str]) -> str:
    return WORD.sub(lambda match: HIDDEN if is_name(match.group(), stems) else match.group(), text)


def hide_names(tasks: list[ReviewTask], name: str) -> list[ReviewTask]:
    stems = name_stems(name)
    hidden = []
    for task in tasks:
        steps = [
            step.model_copy(update={"latex": hidden_text(step.latex, stems)}) for step in task.steps
        ]
        texts = {field: hidden_text(getattr(task, field), stems) for field in TEXT_FIELDS}
        hidden.append(task.model_copy(update={**texts, "steps": steps}))
    return hidden
