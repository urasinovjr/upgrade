from fastapi import APIRouter

from app.api_model import ApiModel
from app.dependencies import CurrentAccountDep, SessionDep
from app.knowledge import ClosureOut, list_closures
from app.students import StudentOut, list_students

router = APIRouter(tags=["state"])


class StateOut(ApiModel):
    students: list[StudentOut]
    works: list[dict]
    closures: list[ClosureOut]


@router.get("/state")
async def read_state(current: CurrentAccountDep, session: SessionDep) -> StateOut:
    teacher_id = current.user.id
    students = await list_students(session, teacher_id)
    closures = await list_closures(session, teacher_id)
    return StateOut(
        students=[StudentOut.model_validate(student) for student in students],
        works=[],
        closures=[ClosureOut.model_validate(closure) for closure in closures],
    )
