from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, now_column

COLORS = ("teal", "sand", "lilac", "blue")


class Student(Base):
    __tablename__ = "students"
    __table_args__ = (
        UniqueConstraint("id", "teacher_id"),
        CheckConstraint("grade BETWEEN 9 AND 11", name="ck_students_grade"),
        CheckConstraint("color IN ('teal', 'sand', 'lilac', 'blue')", name="ck_students_color"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    teacher_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    grade: Mapped[int]
    goal: Mapped[str] = mapped_column(String(500))
    color: Mapped[str] = mapped_column(String(16))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = now_column()
