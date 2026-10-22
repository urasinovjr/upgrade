from dataclasses import dataclass


@dataclass(frozen=True)
class Topic:
    id: str
    name: str
    prerequisites: tuple[str, ...]


TOPICS = (
    Topic("fractions", "Дроби", ()),
    Topic("powers", "Степени", ()),
    Topic("domain", "Область допустимых значений", ("fractions", "powers")),
    Topic("equations", "Квадратные уравнения", ("powers",)),
    Topic("roots", "Иррациональные уравнения", ("domain", "equations")),
    Topic("inequalities", "Неравенства", ("domain", "equations")),
    Topic("logs", "Логарифмы", ("powers", "domain")),
)
TOPIC_IDS = frozenset(topic.id for topic in TOPICS)
