import random
from dataclasses import dataclass

TUTORS_PER_LEVEL = 10
STUDENTS_PER_TUTOR = 12
BATCH_SIZE = 8
WINDOW_SECONDS = 60.0
CRASH_AT_SECONDS = (20.0, 40.0)
CRASH_DOWN_SECONDS = 3.0
CLIENT_TIMEOUT = 3.0
CLIENT_ATTEMPTS = 3
CLIENT_RETRY_PAUSE = 1.0
TIME_SCALE = 0.1


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
