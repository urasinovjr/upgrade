from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import JSON, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, now_column


class StandWork(Base):
    __tablename__ = "stand_works"
    __table_args__ = (UniqueConstraint("teacher_id", "idempotency_key"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    teacher_id: Mapped[str] = mapped_column(String(64))
    student_id: Mapped[str] = mapped_column(String(64))
    upload_id: Mapped[str] = mapped_column(String(64), index=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(64))
    pages: Mapped[int]
    created_at: Mapped[datetime] = now_column()


class StandResult(Base):
    __tablename__ = "stand_results"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    work_id: Mapped[UUID] = mapped_column(ForeignKey("stand_works.id"), unique=True)
    text: Mapped[str]
    analysis: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = now_column()
