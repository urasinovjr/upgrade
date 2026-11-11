from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, now_column

STAGES = ("preparation", "masking", "review", "export", "teacher_upload", "remediation")


class PilotParticipant(Base):
    __tablename__ = "pilot_participants"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    note: Mapped[str] = mapped_column(String(200))
    enrolled_at: Mapped[datetime] = now_column()


class ActiveInterval(Base):
    __tablename__ = "active_intervals"
    __table_args__ = (
        ForeignKeyConstraint(
            ["work_id", "teacher_id"], ["works.id", "works.teacher_id"], ondelete="CASCADE"
        ),
        ForeignKeyConstraint(
            ["homework_id", "teacher_id"],
            ["homeworks.id", "homeworks.teacher_id"],
            ondelete="CASCADE",
        ),
        CheckConstraint(
            "(work_id IS NULL) <> (homework_id IS NULL)", name="ck_active_intervals_target"
        ),
        CheckConstraint(
            "stage IN ('preparation', 'masking', 'review', 'export', "
            "'teacher_upload', 'remediation')",
            name="ck_active_intervals_stage",
        ),
        CheckConstraint("ended_at > started_at", name="ck_active_intervals_order"),
        Index("ix_active_intervals_work", "work_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    teacher_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    work_id: Mapped[UUID | None]
    homework_id: Mapped[UUID | None]
    stage: Mapped[str] = mapped_column(String(16))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = now_column()


class ManualSession(Base):
    __tablename__ = "manual_sessions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["student_id", "teacher_id"],
            ["students.id", "students.teacher_id"],
            ondelete="CASCADE",
        ),
        CheckConstraint("task_count BETWEEN 1 AND 100", name="ck_manual_sessions_tasks"),
        CheckConstraint("active_seconds >= 0", name="ck_manual_sessions_active"),
        CheckConstraint(
            "corrected_seconds IS NULL OR corrected_seconds >= 0",
            name="ck_manual_sessions_corrected",
        ),
        Index("ix_manual_sessions_teacher", "teacher_id", "finished_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    teacher_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    student_id: Mapped[UUID]
    task_count: Mapped[int]
    task_family: Mapped[str] = mapped_column(String(32))
    active_seconds: Mapped[int]
    corrected_seconds: Mapped[int | None]
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = now_column()
