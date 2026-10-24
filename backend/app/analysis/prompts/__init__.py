from types import ModuleType

from app.analysis.contract import ConditionImage, ReviewTask
from app.analysis.prompts import math_1

PROMPTS: dict[str, ModuleType] = {math_1.VERSION: math_1}
WITH_CONDITIONS: set[str] = set()


def review_messages(
    prompt: ModuleType, tasks: list[ReviewTask], conditions: list[ConditionImage]
) -> list[dict]:
    if prompt.VERSION in WITH_CONDITIONS:
        return prompt.review_messages(tasks, conditions)
    return prompt.review_messages(tasks)


__all__ = ["PROMPTS", "review_messages"]
