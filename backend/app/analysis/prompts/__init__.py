from types import ModuleType

from app.analysis.contract import ConditionImage, ReviewTask
from app.analysis.prompts import math_1, math_2, math_3, math_4

PROMPTS: dict[str, ModuleType] = {
    math_1.VERSION: math_1,
    math_2.VERSION: math_2,
    math_3.VERSION: math_3,
    math_4.VERSION: math_4,
}
WITH_CONDITIONS = {math_2.VERSION, math_3.VERSION, math_4.VERSION}


def review_messages(
    prompt: ModuleType, tasks: list[ReviewTask], conditions: list[ConditionImage]
) -> list[dict]:
    if prompt.VERSION in WITH_CONDITIONS:
        return prompt.review_messages(tasks, conditions)
    return prompt.review_messages(tasks)


__all__ = ["PROMPTS", "review_messages"]
