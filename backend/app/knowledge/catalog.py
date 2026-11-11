import hashlib
import json

from app.knowledge.families import FAMILY_NAMES
from app.knowledge.task_types import TASK_TYPES
from app.knowledge.topics import TOPIC_IDS, TOPICS

CATALOG_VERSION = "math-3"
ALIASES: dict[str, str] = {}
LEGACY_TOPICS = ("fractions", "powers", "domain", "equations", "roots", "inequalities", "logs")
KNOWN_TOPICS = TOPIC_IDS | frozenset(ALIASES)


def canonical_topic(topic_id: str, aliases: dict[str, str] = ALIASES) -> str:
    return aliases.get(topic_id, topic_id)


def catalog_payload() -> dict:
    return {
        "version": CATALOG_VERSION,
        "families": [{"id": key, "name": name} for key, name in FAMILY_NAMES.items()],
        "topics": [
            {
                "id": topic.id,
                "name": topic.name,
                "shortName": topic.short_name,
                "description": topic.description,
                "grade": topic.grade,
                "family": topic.family,
                "prerequisites": list(topic.prerequisites),
            }
            for topic in TOPICS
        ],
        "taskTypes": [
            {
                "id": item.id,
                "family": item.family,
                "name": item.name,
                "topicIds": list(item.topic_ids),
                "inScope": item.in_scope,
            }
            for item in TASK_TYPES
        ],
        "aliases": dict(ALIASES),
    }


def catalog_json() -> str:
    return json.dumps(catalog_payload(), ensure_ascii=False, indent=2) + "\n"


def catalog_hash() -> str:
    canonical = json.dumps(catalog_payload(), ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


def duplicates(ids: list[str]) -> list[str]:
    return sorted({item for item in ids if ids.count(item) > 1})


def cycle_topics(links: dict[str, tuple[str, ...]]) -> list[str]:
    state: dict[str, str] = {}
    found: list[str] = []

    def visit(topic_id: str) -> None:
        state[topic_id] = "open"
        for parent in links.get(topic_id, ()):
            if state.get(parent) == "open":
                found.append(topic_id)
            elif parent not in state:
                visit(parent)
        state[topic_id] = "done"

    for topic_id in links:
        if topic_id not in state:
            visit(topic_id)
    return sorted(set(found))


def catalog_problems(aliases: dict[str, str] = ALIASES) -> list[str]:
    topic_ids = [topic.id for topic in TOPICS]
    type_ids = [item.id for item in TASK_TYPES]
    problems = [f"тема повторяется: {item}" for item in duplicates(topic_ids)]
    problems += [f"тип задачи повторяется: {item}" for item in duplicates(type_ids)]
    for topic in TOPICS:
        missing = [item for item in topic.prerequisites if item not in TOPIC_IDS]
        problems += [f"{topic.id}: нет предварительной темы {item}" for item in missing]
    links = {topic.id: topic.prerequisites for topic in TOPICS}
    problems += [f"цикл в связях темы {item}" for item in cycle_topics(links)]
    for item in TASK_TYPES:
        missing = [topic for topic in item.topic_ids if topic not in TOPIC_IDS]
        problems += [f"{item.id}: нет темы {topic}" for topic in missing]
        if item.in_scope and (item.family is None or not item.topic_ids):
            problems.append(f"{item.id}: у типа в охвате нужны семейство и темы")
    for alias, target in aliases.items():
        if alias in TOPIC_IDS:
            problems.append(f"алиас {alias} совпадает с темой")
        if target not in TOPIC_IDS:
            problems.append(f"алиас {alias} ведёт к неизвестной теме {target}")
    problems += [f"нет исходной темы {item}" for item in LEGACY_TOPICS if item not in TOPIC_IDS]
    return problems
