from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, now_column


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        Index("ix_jobs_status_run_after", "status", "run_after"),
        Index("ix_jobs_kind_subject_id", "kind", "subject_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    kind: Mapped[str] = mapped_column(String(32))
    subject_id: Mapped[UUID]
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    dedupe_key: Mapped[str | None] = mapped_column(String(128), unique=True)
    status: Mapped[str] = mapped_column(String(16), default="queued")
    attempts: Mapped[int] = mapped_column(default=0)
    deferrals: Mapped[int] = mapped_column(default=0)
    max_attempts: Mapped[int]
    run_after: Mapped[datetime] = now_column()
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = now_column()
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
