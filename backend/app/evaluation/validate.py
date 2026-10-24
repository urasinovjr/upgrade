import io
from collections import defaultdict
from pathlib import Path

from PIL import Image
from pypdf import PdfReader
from pypdf.errors import PdfReadError

from app.analysis.names import NameForms, found_in, name_forms
from app.evaluation.manifest import Manifest, TaskCard, WorkCard, admitted_tasks
from app.files.inspection import JPEG, PDF, PNG, sniff_type
from app.knowledge.task_types import TASK_TYPES
from app.knowledge.topics import TOPIC_IDS
from app.redaction.geometry import inside_page

MIN_TASKS = 100
MIN_CORRECT = 50
RECT_KEYS = ("x", "y", "width", "height")
TASK_TYPES_BY_ID = {item.id: item for item in TASK_TYPES}


TECHNICAL_KEYS = {
    "dpi",
    "gamma",
    "aspect",
    "jfif",
    "jfif_version",
    "jfif_unit",
    "jfif_density",
    "progressive",
    "progression",
    "transparency",
}


def image_metadata(data: bytes) -> bool:
    image = Image.open(io.BytesIO(data))
    return len(image.getexif()) > 0 or bool(set(image.info) - TECHNICAL_KEYS)


def pdf_metadata(data: bytes) -> bool:
    reader = PdfReader(io.BytesIO(data))
    info = reader.metadata or {}
    return any(value for key, value in info.items() if key != "/Producer")


def has_metadata(data: bytes, content_type: str | None) -> bool:
    try:
        if content_type == PDF:
            return pdf_metadata(data)
        return image_metadata(data)
    except (OSError, PdfReadError):
        return False


def file_problems(root: Path, work: WorkCard, names: list[str]) -> list[str]:
    problems = []
    for card in work.files:
        path = root / card.path
        lowered = card.path.lower()
        if any(name.lower() in lowered for name in names):
            problems.append(f"{work.work_id}: имя ученика в названии файла {card.path}")
        if not path.is_file():
            problems.append(f"{work.work_id}: нет файла {card.path}")
            continue
        data = path.read_bytes()
        content_type = sniff_type(data[:16])
        if content_type not in (JPEG, PNG, PDF):
            problems.append(f"{work.work_id}: {card.path} не JPG, PNG или PDF")
        elif has_metadata(data, content_type):
            problems.append(f"{work.work_id}: в {card.path} остались метаданные")
    return problems


def task_type_problems(where: str, task: TaskCard) -> list[str]:
    if not task.task_type:
        return []
    item = TASK_TYPES_BY_ID.get(task.task_type)
    if item is None:
        return [f"{where}: тип задачи {task.task_type!r} не из справочника"]
    if not item.in_scope:
        return [f"{where}: тип {item.id} вне охвата, исключите задачу с причиной"]
    if task.family != "mixed" and item.family != task.family:
        return [f"{where}: тип {item.id} из семейства {item.family}, а не {task.family}"]
    return []


def condition_problems(where: str, work: WorkCard, task: TaskCard) -> list[str]:
    count = len(work.files)
    problems = [
        f"{where}: файла условия {index} нет в работе"
        for index in task.condition_files
        if not 1 <= index <= count
    ]
    area = task.condition_region
    if area is not None:
        if not 1 <= area.file <= count:
            problems.append(f"{where}: файла {area.file} для области условия нет в работе")
        if not inside_page({key: area.region.get(key, -1.0) for key in RECT_KEYS}):
            problems.append(f"{where}: область условия выходит за страницу")
    return problems


def task_problems(work: WorkCard, task: TaskCard, forms: NameForms) -> list[str]:
    where = f"{work.work_id}/{task.task_id}"
    text = " ".join([task.condition, task.formula, task.explanation, *task.transcription])
    problems = [f"{where}: имя ученика в тексте карточки"] if found_in(text, forms) else []
    problems += condition_problems(where, work, task)
    if task.admission == "excluded":
        if not task.exclusion_reason.strip():
            problems.append(f"{where}: укажите причину исключения")
        return problems
    if task.correct is None:
        problems.append(f"{where}: нет вывода о корректности")
    if task.topic_id not in TOPIC_IDS:
        problems.append(f"{where}: тема {task.topic_id!r} не из справочника")
    problems += task_type_problems(where, task)
    if not task.transcription:
        problems.append(f"{where}: нет экспертной транскрипции")
    if task.correct is False:
        steps = len(task.transcription)
        if task.first_error_step is None or not 1 <= task.first_error_step <= steps:
            problems.append(f"{where}: первый ошибочный шаг вне транскрипции")
        if not task.explanation.strip():
            problems.append(f"{where}: нет объяснения ошибки")
    return problems


def split_problems(manifest: Manifest) -> list[str]:
    splits: dict[tuple[str, str], set[str]] = defaultdict(set)
    for work in manifest.works:
        splits[("работа", work.work_id)].add(work.split)
        splits[("решение", work.solution_group)].add(work.split)
    return [
        f"{kind} {value} попала и в dev, и в acceptance"
        for (kind, value), found in splits.items()
        if len(found) > 1
    ]


def duplicate_problems(manifest: Manifest) -> list[str]:
    seen: set[tuple[str, str]] = set()
    problems = []
    for work in manifest.works:
        for task in work.tasks:
            key = (work.work_id, task.task_id)
            if key in seen:
                problems.append(f"{work.work_id}/{task.task_id}: повтор идентификатора")
            seen.add(key)
    return problems


def size_warnings(manifest: Manifest) -> list[str]:
    tasks = [
        task
        for work in manifest.works
        if work.split == "acceptance"
        for task in admitted_tasks(work)
    ]
    correct = [task for task in tasks if task.correct]
    warnings = []
    if len(tasks) < MIN_TASKS:
        warnings.append(f"в acceptance допущено задач: {len(tasks)}, нужно {MIN_TASKS}")
    if len(correct) < MIN_CORRECT:
        warnings.append(f"в acceptance верных решений: {len(correct)}, нужно {MIN_CORRECT}")
    return warnings


def validate(manifest: Manifest, root: Path, names: list[str]) -> tuple[list[str], list[str]]:
    problems = split_problems(manifest) + duplicate_problems(manifest)
    forms = name_forms(names)
    for work in manifest.works:
        problems += file_problems(root, work, names)
        for task in work.tasks:
            problems += task_problems(work, task, forms)
    return problems, size_warnings(manifest)
