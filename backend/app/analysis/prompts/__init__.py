from types import ModuleType

from app.analysis.prompts import math_1

PROMPTS: dict[str, ModuleType] = {math_1.VERSION: math_1}

__all__ = ["PROMPTS"]
