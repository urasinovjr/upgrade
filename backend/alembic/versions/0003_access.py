import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def moment(name: str, nullable: bool = True) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), nullable=nullable)


def created_at(name: str = "created_at") -> sa.Column:
    return sa.Column(
        name, sa.DateTime(timezone=True), server_default=sa.func.clock_timestamp(), nullable=False
    )


def user_id() -> sa.Column:
    return sa.Column(
        "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(320), unique=True),
        moment("email_confirmed_at"),
        sa.Column("password_hash", sa.String(255)),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("failed_logins", sa.Integer(), nullable=False),
        moment("locked_until"),
        moment("last_login_at"),
        created_at(),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        user_id(),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("csrf_token", sa.String(64), nullable=False),
        moment("expires_at", nullable=False),
        created_at(),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])
    op.create_table(
        "email_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        user_id(),
        sa.Column("purpose", sa.String(16), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        moment("expires_at", nullable=False),
        moment("used_at"),
        created_at(),
        sa.CheckConstraint("purpose IN ('confirm', 'reset')", name="ck_email_tokens_purpose"),
    )
    op.create_index("ix_email_tokens_user_purpose", "email_tokens", ["user_id", "purpose"])
    op.create_table(
        "consents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        user_id(),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("document_version", sa.String(32), nullable=False),
        sa.Column("ip_address", sa.String(45)),
        created_at("accepted_at"),
        sa.UniqueConstraint("user_id", "kind", "document_version"),
        sa.CheckConstraint("kind IN ('terms', 'personal_data')", name="ck_consents_kind"),
    )
    op.create_table(
        "rate_limits",
        sa.Column("bucket", sa.String(200), primary_key=True),
        moment("window_started_at", nullable=False),
        sa.Column("hits", sa.Integer(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("rate_limits")
    op.drop_table("consents")
    op.drop_table("email_tokens")
    op.drop_table("sessions")
    op.drop_table("users")
