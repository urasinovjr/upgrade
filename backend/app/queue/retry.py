import random


def retry_delay(attempt: int, base: float) -> float:
    return base * 2 ** (attempt - 1) * random.uniform(0.5, 1.5)
