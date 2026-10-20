from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, ForeignKey, ForeignKeyConstraint, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, now_column


class Closure(Base):
    __tablename__ = "closures"
    __table_args__ = (
        ForeignKeyConstraint(
            ["student_id", "teacher_id"],
            ["students.id", "students.teacher_id"],
            ondelete="CASCADE",
        ),
        CheckConstraint("action IN ('close', 'reopen')", name="ck_closures_action"),
        Index("ix_closures_student_created", "student_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    teacher_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    student_id: Mapped[UUID]
    topic_id: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(8))
    note: Mapped[str] = mapped_column(String(2000))
    created_at: Mapped[datetime] = now_column()
