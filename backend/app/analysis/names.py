import json
import re
from dataclasses import dataclass

from app.analysis.contract import ReviewTask
from app.analysis.name_forms import NAME_GROUPS, STOP_WORDS, TRANSLIT
from app.students.models import Student
from app.works.schemas import Task

TOKEN = re.compile(r"\\\\|\\[a-z]+|[a-zа-яё]+", re.IGNORECASE)
CYRILLIC = re.compile(r"[а-яё]+")
CYRILLIC_ENDINGS = "аеиоуыэюяйь"
LATIN_ENDINGS = "aeiouy"
CYRILLIC_INFLECTION = re.compile(r"[аеиоуыэюяйьмвх]{0,3}")
LATIN_INFLECTION = re.compile(r"[aeiouyjmvhk]{0,4}")
SHORTEST_STEM = 3
SHORT_CASES = {"а": ("ы", "е", "у", "ой"), "я": ("и", "е", "ю", "ей")}
MOST_VARIANTS = 64
HIDDEN = "[скрыто]"
TEXT_FIELDS = ("condition", "formula", "reference")


@dataclass(frozen=True)
class NameForms:
    own: frozenset[str]
    exact: frozenset[str]
    cyrillic_stems: frozenset[str]
    latin_stems: frozenset[str]


def normalized(word: str) -> str:
    return word.lower().replace("ё", "е")


def words_of(text: str) -> list[str]:
    return [token for token in TOKEN.findall(text) if not token.startswith("\\")]


def group_forms(words: set[str]) -> set[str]:
    forms = set(words)
    for group in NAME_GROUPS:
        members = {normalized(item) for item in group}
        if members & words:
            forms |= members
    return forms


def latin_variants(word: str) -> set[str]:
    variants = [""]
    for letter in word:
        options = TRANSLIT.get(letter, (letter,))
        variants = [variant + option for variant in variants for option in options]
        variants = variants[:MOST_VARIANTS]
    return set(variants) | {variant.replace("ks", "x") for variant in variants}


def stem_of(word: str, endings: str) -> str:
    return word[:-1] if word[-1] in endings and len(word) > SHORTEST_STEM else word


def short_cases(form: str) -> set[str]:
    if len(form) != SHORTEST_STEM:
        return set()
    return {form[:-1] + ending for ending in SHORT_CASES.get(form[-1], ())}


def name_forms(names: list[str]) -> NameForms:
    words = {normalized(word) for name in names for word in words_of(name)}
    exact = set()
    cyrillic_stems = set()
    latin_stems = set()
    for form in group_forms(words):
        if CYRILLIC.fullmatch(form) and len(form) < SHORTEST_STEM:
            exact.add(form)
            continue
        if CYRILLIC.fullmatch(form):
            exact |= short_cases(form)
            cyrillic_stems.add(stem_of(form, CYRILLIC_ENDINGS))
        for variant in latin_variants(form):
            if len(variant) >= SHORTEST_STEM:
                latin_stems.add(stem_of(variant, LATIN_ENDINGS))
    return NameForms(
        frozenset(words), frozenset(exact), frozenset(cyrillic_stems), frozenset(latin_stems)
    )


def has_stem(word: str, stems: frozenset[str], inflection: re.Pattern) -> bool:
    return any(word.startswith(stem) and inflection.fullmatch(word[len(stem) :]) for stem in stems)


def is_name(word: str, forms: NameForms) -> bool:
    if normalized(word) in forms.own:
        return True
    if word.lower() in STOP_WORDS:
        return False
    word = normalized(word)
    return (
        word in forms.exact
        or has_stem(word, forms.cyrillic_stems, CYRILLIC_INFLECTION)
        or has_stem(word, forms.latin_stems, LATIN_INFLECTION)
    )


def found_in(text: str, forms: NameForms) -> bool:
    return any(is_name(word, forms) for word in words_of(text))


def student_names(student: Student | None) -> list[str]:
    return [student.name, *student.aliases] if student else []


def mentions(names: list[str], text: str) -> bool:
    return found_in(text, name_forms(names))


def name_places(names: list[str], tasks: list[Task]) -> list[dict]:
    forms = name_forms(names)
    places = []
    for task in tasks:
        for field in TEXT_FIELDS:
            if found_in(getattr(task, field), forms):
                places.append({"taskId": task.id, "field": field})
        for step in task.steps:
            if found_in(step.latex, forms):
                places.append({"taskId": task.id, "field": "step", "stepId": step.id})
    return places


def hidden_word(token: str, forms: NameForms) -> str:
    if token.startswith("\\") or not is_name(token, forms):
        return token
    return HIDDEN


def hidden_text(text: str, forms: NameForms) -> str:
    return TOKEN.sub(lambda match: hidden_word(match.group(), forms), text)


def hide_names(tasks: list[ReviewTask], names: list[str]) -> list[ReviewTask]:
    forms = name_forms(names)
    hidden = []
    for task in tasks:
        steps = [
            step.model_copy(update={"latex": hidden_text(step.latex, forms)}) for step in task.steps
        ]
        texts = {field: hidden_text(getattr(task, field), forms) for field in TEXT_FIELDS}
        hidden.append(task.model_copy(update={**texts, "steps": steps}))
    return hidden


def name_forms_payload() -> dict:
    return {
        "groups": [list(group) for group in NAME_GROUPS],
        "stopWords": sorted(STOP_WORDS),
        "translit": {letter: list(options) for letter, options in TRANSLIT.items()},
    }


def name_forms_json() -> str:
    return json.dumps(name_forms_payload(), ensure_ascii=False, indent=2) + "\n"
