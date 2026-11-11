from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import DomainError
from app.homework.models import Homework
from app.students import owned_student
from app.timing.models import ActiveInterval, ManualSession, PilotParticipant
from app.timing.schemas import IntervalIn, IntervalsOut, ManualSessionIn, ManualSessionOut
from app.works.models import Work

MAX_INTERVAL = timedelta(minutes=15)
CLOCK_SKEW = timedelta(minutes=2)


async def is_participant(session: AsyncSession, user_id: UUID) -> bool:
    return await session.get(PilotParticipant, user_id) is not None


async def require_participant(session: AsyncSession, user_id: UUID) -> None:
    if not await is_participant(session, user_id):
        raise DomainError("timing_disabled")


async def enroll(session: AsyncSession, user_id: UUID, note: str) -> None:
    await session.execute(
        insert(PilotParticipant)
        .values(user_id=user_id, note=note)
        .on_conflict_do_update(index_elements=["user_id"], set_={"note": note})
    )


async def leave(session: AsyncSession, user_id: UUID) -> None:
    await session.execute(delete(PilotParticipant).where(PilotParticipant.user_id == user_id))


def plausible(interval: IntervalIn, now: datetime) -> bool:
    length = interval.ended_at - interval.started_at
    return timedelta(0) < length <= MAX_INTERVAL and interval.ended_at <= now + CLOCK_SKEW


async def owned_work_ids(session: AsyncSession, teacher_id: UUID, ids: set[UUID]) -> set[UUID]:
    if not ids:
        return set()
    rows = await session.scalars(
        select(Work.id).where(Work.teacher_id == teacher_id, Work.id.in_(ids))
    )
    return set(rows)


async def save_intervals(
    session: AsyncSession, teacher_id: UUID, intervals: list[IntervalIn]
) -> IntervalsOut:
    now = datetime.now(UTC)
    valid = [interval for interval in intervals if plausible(interval, now)]
    known = await owned_work_ids(
        session, teacher_id, {interval.work_id for interval in valid if interval.work_id}
    )
    homework_ids = {interval.homework_id for interval in valid if interval.homework_id}
    known_homework = set(
        await session.scalars(
            select(Homework.id).where(
                Homework.teacher_id == teacher_id, Homework.id.in_(homework_ids)
            )
        )
    )
    rows = [
        {
            "id": interval.id,
            "teacher_id": teacher_id,
            "work_id": interval.work_id,
            "homework_id": interval.homework_id,
            "stage": interval.stage,
            "started_at": interval.started_at,
            "ended_at": interval.ended_at,
        }
        for interval in valid
        if interval.work_id in known or interval.homework_id in known_homework
    ]
    accepted = 0
    if rows:
        result = await session.scalars(
            insert(ActiveInterval)
            .values(rows)
            .on_conflict_do_nothing(index_elements=["id"])
            .returning(ActiveInterval.id)
        )
        accepted = len(list(result))
    await session.commit()
    unknown = sorted(
        ({interval.work_id for interval in valid if interval.work_id} - known)
        | (homework_ids - known_homework),
        key=str,
    )
    return IntervalsOut(
        accepted=accepted, rejected=len(intervals) - len(valid), unknown_work_ids=unknown
    )


def session_out(item: ManualSession) -> ManualSessionOut:
    return ManualSessionOut(
        id=item.id,
        student_id=item.student_id,
        task_count=item.task_count,
        task_family=item.task_family,
        active_seconds=item.active_seconds,
        corrected_seconds=item.corrected_seconds,
        started_at=item.started_at,
        finished_at=item.finished_at,
    )


async def list_manual(session: AsyncSession, teacher_id: UUID) -> list[ManualSessionOut]:
    rows = await session.scalars(
        select(ManualSession)
        .where(ManualSession.teacher_id == teacher_id)
        .order_by(ManualSession.finished_at.desc())
    )
    return [session_out(item) for item in rows]


async def save_manual(
    session: AsyncSession, teacher_id: UUID, session_id: UUID, data: ManualSessionIn
) -> ManualSessionOut:
    if data.finished_at < data.started_at:
        raise DomainError("manual_session_invalid")
    await owned_student(session, teacher_id, data.student_id)
    item = await session.get(ManualSession, session_id, with_for_update=True)
    if item is not None and item.teacher_id != teacher_id:
        raise DomainError("manual_session_not_found")
    if item is None:
        item = ManualSession(id=session_id, teacher_id=teacher_id)
        session.add(item)
    for field, value in data.model_dump().items():
        setattr(item, field, value)
    await session.commit()
    return session_out(item)


async def delete_manual(session: AsyncSession, teacher_id: UUID, session_id: UUID) -> None:
    result = await session.execute(
        delete(ManualSession).where(
            ManualSession.id == session_id, ManualSession.teacher_id == teacher_id
        )
    )
    if result.rowcount == 0:
        raise DomainError("manual_session_not_found")
    await session.commit()
