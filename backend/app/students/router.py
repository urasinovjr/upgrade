from uuid import UUID

from fastapi import APIRouter

from app.dependencies import SessionDep, WritableAccountDep
from app.students.schemas import ArchiveIn, StudentIn, StudentOut
from app.students.service import save_student, set_archived

router = APIRouter(prefix="/students", tags=["students"])


@router.put("/{student_id}")
async def put_student(
    student_id: UUID, data: StudentIn, current: WritableAccountDep, session: SessionDep
) -> StudentOut:
    student = await save_student(session, current.user.id, student_id, data)
    return StudentOut.model_validate(student)


@router.post("/{student_id}/archive")
async def archive_student(
    student_id: UUID, data: ArchiveIn, current: WritableAccountDep, session: SessionDep
) -> StudentOut:
    student = await set_archived(session, current.user.id, student_id, data.archived)
    return StudentOut.model_validate(student)
