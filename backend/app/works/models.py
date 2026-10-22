from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, now_column

STATUSES = ("preparation", "queued", "processing", "needs_input", "ready", "confirmed", "failed")


def teacher_column() -> Mapped[UUID]:
    return mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)


class Work(Base):
    __tablename__ = "works"
    __table_args__ = (
        UniqueConstraint("id", "teacher_id"),
        ForeignKeyConstraint(
            ["student_id", "teacher_id"],
            ["students.id", "students.teacher_id"],
            ondelete="CASCADE",
        ),
        CheckConstraint(
            "status IN ('preparation', 'queued', 'processing', 'needs_input', 'ready', "
            "'confirmed', 'failed')",
            name="ck_works_status",
        ),
        Index("ix_works_teacher_created", "teacher_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    teacher_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    student_id: Mapped[UUID]
    title: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(16))
    editing: Mapped[bool]
    manual: Mapped[bool]
    draft: Mapped[dict] = mapped_column(JSONB)
    current_revision_id: Mapped[UUID | None]
    analysis_job_id: Mapped[UUID | None]
    analysis_run_id: Mapped[UUID | None]
    created_at: Mapped[datetime] = now_column()


class WorkFile(Base):
    __tablename__ = "work_files"
    __table_args__ = (
        ForeignKeyConstraint(
            ["work_id", "teacher_id"], ["works.id", "works.teacher_id"], ondelete="CASCADE"
        ),
        CheckConstraint(
            "content_type IN ('image/jpeg', 'image/png', 'application/pdf')",
            name="ck_work_files_type",
        ),
        Index("ix_work_files_work_position", "work_id", "position"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    teacher_id: Mapped[UUID] = teacher_column()
    work_id: Mapped[UUID]
    position: Mapped[int]
    name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(32))
    size: Mapped[int]
    pages: Mapped[int]
    page_order: Mapped[list] = mapped_column(JSONB)
    crops: Mapped[dict] = mapped_column(JSONB)
    masks: Mapped[dict] = mapped_column(JSONB, default=dict)
    checked_pages: Mapped[list] = mapped_column(JSONB, default=list)
    storage_key: Mapped[str] = mapped_column(String(300), unique=True)
    created_at: Mapped[datetime] = now_column()


class WorkRevision(Base):
    __tablename__ = "work_revisions"
    __table_args__ = (UniqueConstraint("work_id", "number"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    work_id: Mapped[UUID] = mapped_column(ForeignKey("works.id", ondelete="CASCADE"))
    number: Mapped[int]
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    draft: Mapped[dict] = mapped_column(JSONB)
    attachments: Mapped[list] = mapped_column(JSONB)
    analysis_run_id: Mapped[UUID | None]


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"
    __table_args__ = (
        CheckConstraint("status IN ('succeeded', 'failed')", name="ck_analysis_runs_status"),
        Index("ix_analysis_runs_created_at", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    work_id: Mapped[UUID] = mapped_column(ForeignKey("works.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[UUID]
    input_revision: Mapped[int]
    recognized: Mapped[bool]
    status: Mapped[str] = mapped_column(String(16))
    error: Mapped[str | None] = mapped_column(String(64))
    provider: Mapped[str] = mapped_column(String(64))
    model: Mapped[str] = mapped_column(String(64))
    prompt_version: Mapped[str] = mapped_column(String(64))
    input: Mapped[dict] = mapped_column(JSONB)
    recognition: Mapped[dict | None] = mapped_column(JSONB)
    review: Mapped[dict | None] = mapped_column(JSONB)
    draft: Mapped[dict | None] = mapped_column(JSONB)
    recognize_ms: Mapped[int | None]
    review_ms: Mapped[int | None]
    request_id: Mapped[str | None] = mapped_column(String(64))
    queued_ms: Mapped[int | None]
    input_tokens: Mapped[int]
    output_tokens: Mapped[int]
    cost: Mapped[Decimal] = mapped_column(Numeric(12, 6))
    cost_currency: Mapped[str] = mapped_column(String(8))
    created_at: Mapped[datetime] = now_column()
