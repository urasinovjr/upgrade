import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
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
        "oauth_identities",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("subject", sa.String(128), nullable=False),
        sa.Column("email", sa.String(320)),
        created_at(),
        sa.UniqueConstraint("provider", "subject"),
        sa.UniqueConstraint("user_id", "provider"),
        sa.CheckConstraint("provider IN ('yandex', 'vk')", name="ck_oauth_identities_provider"),
    )
    op.create_table(
        "oauth_states",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("state_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("purpose", sa.String(8), nullable=False),
        sa.Column("code_verifier", sa.String(128), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("terms_version", sa.String(32)),
        sa.Column("personal_data_version", sa.String(32)),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        created_at(),
        sa.CheckConstraint("purpose IN ('login', 'link')", name="ck_oauth_states_purpose"),
    )


def downgrade() -> None:
    op.drop_table("oauth_states")
    op.drop_table("oauth_identities")
