from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, ForeignKeyConstraint, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, now_column


class Homework(Base):
    __tablename__ = "homeworks"
    __table_args__ = (UniqueConstraint("id", "teacher_id"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    teacher_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    revision: Mapped[int] = mapped_column(default=1)
    tasks: Mapped[list] = mapped_column(JSONB, default=list)
    source_text: Mapped[str] = mapped_column(Text, default="", server_default="")
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = now_column()


class HomeworkFile(Base):
    __tablename__ = "homework_files"
    __table_args__ = (
        ForeignKeyConstraint(
            ["homework_id", "teacher_id"],
            ["homeworks.id", "homeworks.teacher_id"],
            ondelete="CASCADE",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    teacher_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    homework_id: Mapped[UUID]
    name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(32))
    size: Mapped[int]
    pages: Mapped[int]
    storage_key: Mapped[str] = mapped_column(String(300), unique=True)
    masks: Mapped[dict] = mapped_column(JSONB, default=dict)
    checked_pages: Mapped[list] = mapped_column(JSONB, default=list)


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (
        UniqueConstraint("homework_id", "student_id"),
        UniqueConstraint("id", "teacher_id", "student_id"),
        ForeignKeyConstraint(
            ["homework_id", "teacher_id"],
            ["homeworks.id", "homeworks.teacher_id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["student_id", "teacher_id"],
            ["students.id", "students.teacher_id"],
            ondelete="CASCADE",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    teacher_id: Mapped[UUID]
    student_id: Mapped[UUID]
    homework_id: Mapped[UUID]
    created_at: Mapped[datetime] = now_column()


class StudentAccess(Base):
    __tablename__ = "student_access"

    student_id: Mapped[UUID] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    login: Mapped[str] = mapped_column(String(64), unique=True)
    invitation_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    invitation_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class HomeworkJob(Base):
    __tablename__ = "homework_jobs"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    teacher_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    homework_id: Mapped[UUID | None] = mapped_column(ForeignKey("homeworks.id", ondelete="CASCADE"))
    work_id: Mapped[UUID | None] = mapped_column(ForeignKey("works.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(32))
    revision: Mapped[int]
    status: Mapped[str] = mapped_column(String(24), default="queued")
    input: Mapped[dict] = mapped_column(JSONB)
    result: Mapped[dict | None] = mapped_column(JSONB)
    provenance: Mapped[dict] = mapped_column(JSONB, default=dict)
    job_id: Mapped[UUID | None]
    created_at: Mapped[datetime] = now_column()
