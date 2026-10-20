from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, now_column


class Plan(Base):
    __tablename__ = "plans"
    __table_args__ = (
        CheckConstraint("price_minor >= 0", name="ck_plans_price"),
        CheckConstraint("period_days > 0", name="ck_plans_period"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    title: Mapped[str] = mapped_column(String(100))
    price_minor: Mapped[int]
    currency: Mapped[str] = mapped_column(String(3))
    period_days: Mapped[int]
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = now_column()


class Subscription(Base):
    __tablename__ = "subscriptions"
    __table_args__ = (
        CheckConstraint("kind IN ('trial', 'granted', 'paid')", name="ck_subscriptions_kind"),
        CheckConstraint("ends_at > starts_at", name="ck_subscriptions_period"),
        Index("ix_subscriptions_user_ends", "user_id", "ends_at"),
        Index(
            "ux_subscriptions_one_trial",
            "user_id",
            unique=True,
            postgresql_where=text("kind = 'trial'"),
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    plan_id: Mapped[UUID | None] = mapped_column(ForeignKey("plans.id"))
    kind: Mapped[str] = mapped_column(String(16))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    note: Mapped[str] = mapped_column(String(200), default="")
    external_payment_id: Mapped[str | None] = mapped_column(String(100), unique=True)
    created_at: Mapped[datetime] = now_column()
