import os
import random
from dataclasses import dataclass

TUTORS_PER_LEVEL = 10
STUDENTS_PER_TUTOR = 12
BATCH_SIZE = 8
CLIENT_ATTEMPTS = 3
PAGE_BYTES = 1_500_000


@dataclass(frozen=True)
class Timing:
    window_seconds: float
    client_timeout: float
    retry_pause: float
    poll_interval: float
    crash_at: tuple[float, float]

    @classmethod
    def from_scale(cls, scale: float) -> "Timing":
        if scale <= 0:
            raise ValueError("Time scale must be positive")
        return cls(
            600.0 * scale, 30.0 * scale, 10.0 * scale, 2.0 * scale, (200.0 * scale, 400.0 * scale)
        )


TIME_SCALE = float(os.environ.get("STAND_TIME_SCALE", "0.1"))
TIMING = Timing.from_scale(TIME_SCALE)
WINDOW_SECONDS = TIMING.window_seconds
CRASH_AT_SECONDS = TIMING.crash_at
CRASH_DOWN_SECONDS = float(os.environ.get("STAND_CRASH_DOWN_SECONDS", "3.0"))
CLIENT_TIMEOUT = TIMING.client_timeout
CLIENT_RETRY_PAUSE = TIMING.retry_pause
POLL_INTERVAL = TIMING.poll_interval
POLL_LIMIT_SECONDS = 6000.0 * TIME_SCALE
IDEM_RETRY_SECONDS = 300.0 * TIME_SCALE


@dataclass(frozen=True)
class Upload:
    upload_id: str
    teacher_id: str
    student_id: str
    pages: int
    start_at: float


def build_uploads(level: int, seed: int) -> list[Upload]:
    rng = random.Random(seed)
    uploads = []
    for tutor in range(TUTORS_PER_LEVEL * level):
        start_at = rng.uniform(0, WINDOW_SECONDS)
        students = rng.sample(range(STUDENTS_PER_TUTOR), BATCH_SIZE)
        for student in students:
            uploads.append(
                Upload(
                    upload_id=f"s{seed}-t{tutor}-u{student}",
                    teacher_id=f"tutor-{tutor}",
                    student_id=f"tutor-{tutor}-student-{student}",
                    pages=rng.randint(1, 3),
                    start_at=start_at,
                )
            )
    return uploads


@dataclass(frozen=True)
class Condition:
    env: dict[str, str]
    upload: bool = False


STAND_ENV = {
    "RATE_LIMIT_DELAY": str(5.0 * TIME_SCALE),
    "RATE_LIMIT_MAX_DELAY": str(120.0 * TIME_SCALE),
}
CONDITIONS = {
    "base": Condition(STAND_ENV),
    "t110-cap4": Condition({**STAND_ENV, "PROVIDER_TIMEOUT": "11.0", "PROVIDER_CONCURRENCY": "4"}),
    "storage": Condition(STAND_ENV, upload=True),
}
