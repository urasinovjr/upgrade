from uuid import UUID


def teacher_prefix(teacher_id: UUID) -> str:
    return f"teachers/{teacher_id}/"


def work_prefix(teacher_id: UUID, work_id: UUID) -> str:
    return f"{teacher_prefix(teacher_id)}works/{work_id}/"


def file_key(teacher_id: UUID, work_id: UUID, file_id: UUID) -> str:
    return f"{work_prefix(teacher_id, work_id)}{file_id}"
