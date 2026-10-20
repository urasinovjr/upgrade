from uuid import UUID

from fastapi import APIRouter, status

from app.dependencies import SessionDep, WritableAccountDep
from app.knowledge.schemas import ClosureIn, ClosureOut
from app.knowledge.service import add_closure

router = APIRouter(prefix="/students", tags=["knowledge"])


@router.post("/{student_id}/closures", status_code=status.HTTP_201_CREATED)
async def create_closure(
    student_id: UUID, data: ClosureIn, current: WritableAccountDep, session: SessionDep
) -> ClosureOut:
    closure = await add_closure(session, current.user.id, student_id, data)
    return ClosureOut.model_validate(closure)
