import random


def retry_delay(attempt: int, base: float) -> float:
    return base * 2 ** (attempt - 1) * random.uniform(0.5, 1.5)


def deferral_delay(deferral: int, base: float, cap: float) -> float:
    return min(cap, base * 2 ** (deferral - 1)) * random.uniform(0.75, 1.25)
