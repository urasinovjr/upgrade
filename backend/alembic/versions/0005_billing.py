import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def created_at() -> sa.Column:
    return sa.Column(
        "created_at",
        sa.DateTime(timezone=True),
        server_default=sa.func.clock_timestamp(),
        nullable=False,
    )


def upgrade() -> None:
    op.create_table(
        "plans",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("code", sa.String(32), nullable=False, unique=True),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("price_minor", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("period_days", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        created_at(),
        sa.CheckConstraint("price_minor >= 0", name="ck_plans_price"),
        sa.CheckConstraint("period_days > 0", name="ck_plans_period"),
    )
    op.create_table(
        "subscriptions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("plan_id", sa.Uuid(), sa.ForeignKey("plans.id")),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("note", sa.String(200), nullable=False),
        sa.Column("external_payment_id", sa.String(100), unique=True),
        created_at(),
        sa.CheckConstraint("kind IN ('trial', 'granted', 'paid')", name="ck_subscriptions_kind"),
        sa.CheckConstraint("ends_at > starts_at", name="ck_subscriptions_period"),
    )
    op.create_index("ix_subscriptions_user_ends", "subscriptions", ["user_id", "ends_at"])
    op.create_index(
        "ux_subscriptions_one_trial",
        "subscriptions",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("kind = 'trial'"),
    )


def downgrade() -> None:
    op.drop_table("subscriptions")
    op.drop_table("plans")
