from datetime import datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Query
from sqlalchemy import ForeignKey, Index, String, UniqueConstraint, select, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Mapped, mapped_column

from app.api_model import ApiModel
from app.database import Base, now_column
from app.dependencies import CurrentAccountDep, SessionDep
from app.errors import DomainError

APP_VERSION = "0.2.0"


class ProductEvent(Base):
    __tablename__ = "product_events"
    __table_args__ = (
        UniqueConstraint("teacher_id", "kind", "entity_id", "revision"),
        Index("ix_product_events_teacher_time", "teacher_id", "occurred_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    teacher_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(48))
    entity_id: Mapped[UUID]
    revision: Mapped[int] = mapped_column(default=0)
    source: Mapped[str] = mapped_column(String(16))
    schema_version: Mapped[int] = mapped_column(default=1)
    app_version: Mapped[str] = mapped_column(String(32), default=APP_VERSION)
    occurred_at: Mapped[datetime] = now_column()


async def record_event(session, teacher_id, kind, entity_id, revision=0, source="user"):
    await session.execute(
        insert(ProductEvent)
        .values(
            id=uuid4(),
            teacher_id=teacher_id,
            kind=kind,
            entity_id=entity_id,
            revision=revision,
            source=source,
            schema_version=1,
            app_version=APP_VERSION,
        )
        .on_conflict_do_nothing(constraint="product_events_teacher_id_kind_entity_id_revision_key")
    )


def provider_source(variant: str) -> str:
    return "simulation" if variant == "sim" else "real"


class EventOut(ApiModel):
    id: UUID
    kind: str
    entity_id: UUID
    revision: int
    source: str
    schema_version: int
    app_version: str
    occurred_at: datetime


router = APIRouter(tags=["events"])


class EventPage(ApiModel):
    items: list[EventOut]
    next_cursor: UUID | None


@router.get("/events")
async def list_events(
    current: CurrentAccountDep,
    session: SessionDep,
    after: datetime | None = None,
    cursor: UUID | None = None,
    limit: int = Query(100, ge=1, le=1000),
) -> EventPage:
    query = select(ProductEvent).where(ProductEvent.teacher_id == current.user.id)
    if after is not None:
        query = query.where(ProductEvent.occurred_at > after)
    if cursor is not None:
        anchor = await session.get(ProductEvent, cursor)
        if anchor is None or anchor.teacher_id != current.user.id:
            raise DomainError("event_not_found")
        query = query.where(
            tuple_(ProductEvent.occurred_at, ProductEvent.id) > (anchor.occurred_at, anchor.id)
        )
    events = list(
        await session.scalars(
            query.order_by(ProductEvent.occurred_at, ProductEvent.id).limit(limit + 1)
        )
    )
    return EventPage(
        items=[EventOut.model_validate(event) for event in events[:limit]],
        next_cursor=events[limit - 1].id if len(events) > limit else None,
    )
