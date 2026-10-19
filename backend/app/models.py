from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def now_column() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.clock_timestamp())


class Work(Base):
    __tablename__ = "works"
    __table_args__ = (UniqueConstraint("teacher_id", "idempotency_key"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    teacher_id: Mapped[str] = mapped_column(String(64))
    student_id: Mapped[str] = mapped_column(String(64))
    upload_id: Mapped[str] = mapped_column(String(64), index=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(64))
    pages: Mapped[int]
    created_at: Mapped[datetime] = now_column()


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (Index("ix_jobs_status_run_after", "status", "run_after"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    work_id: Mapped[UUID] = mapped_column(ForeignKey("works.id"), unique=True)
    status: Mapped[str] = mapped_column(String(16), default="queued")
    attempts: Mapped[int] = mapped_column(default=0)
    run_after: Mapped[datetime] = now_column()
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = now_column()
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Result(Base):
    __tablename__ = "results"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    work_id: Mapped[UUID] = mapped_column(ForeignKey("works.id"), unique=True)
    text: Mapped[str]
    analysis: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = now_column()
