from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import extract, func, select

from app.dependencies import CurrentAccountDep, SessionDep
from app.timing.models import ActiveInterval
from app.timing.schemas import (
    ActiveTimeOut,
    IntervalsIn,
    IntervalsOut,
    ManualSessionIn,
    ManualSessionOut,
    TimingOut,
)
from app.timing.service import (
    delete_manual,
    is_participant,
    list_manual,
    require_participant,
    save_intervals,
    save_manual,
)

router = APIRouter(prefix="/timing", tags=["timing"])


@router.get("/summary")
async def active_summary(current: CurrentAccountDep, session: SessionDep) -> list[ActiveTimeOut]:
    await require_participant(session, current.user.id)
    duration = func.sum(extract("epoch", ActiveInterval.ended_at - ActiveInterval.started_at))
    rows = await session.execute(
        select(ActiveInterval.work_id, ActiveInterval.homework_id, ActiveInterval.stage, duration)
        .where(ActiveInterval.teacher_id == current.user.id)
        .group_by(ActiveInterval.work_id, ActiveInterval.homework_id, ActiveInterval.stage)
    )
    return [
        ActiveTimeOut(
            work_id=work_id, homework_id=homework_id, stage=stage, active_seconds=float(seconds)
        )
        for work_id, homework_id, stage, seconds in rows
    ]


@router.get("")
async def read_timing(current: CurrentAccountDep, session: SessionDep) -> TimingOut:
    return TimingOut(enabled=await is_participant(session, current.user.id))


@router.post("/intervals")
async def post_intervals(
    data: IntervalsIn, current: CurrentAccountDep, session: SessionDep
) -> IntervalsOut:
    await require_participant(session, current.user.id)
    return await save_intervals(session, current.user.id, data.intervals)


@router.get("/manual")
async def get_manual(current: CurrentAccountDep, session: SessionDep) -> list[ManualSessionOut]:
    await require_participant(session, current.user.id)
    return await list_manual(session, current.user.id)


@router.put("/manual/{session_id}")
async def put_manual(
    session_id: UUID, data: ManualSessionIn, current: CurrentAccountDep, session: SessionDep
) -> ManualSessionOut:
    await require_participant(session, current.user.id)
    return await save_manual(session, current.user.id, session_id, data)


@router.delete("/manual/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_manual(session_id: UUID, current: CurrentAccountDep, session: SessionDep) -> None:
    await require_participant(session, current.user.id)
    await delete_manual(session, current.user.id, session_id)
