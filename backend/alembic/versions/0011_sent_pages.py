import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("analysis_runs", sa.Column("sanitize_ms", sa.Integer()))
    op.add_column(
        "analysis_runs",
        sa.Column("sent_pages", JSONB(), server_default="[]", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("analysis_runs", "sent_pages")
    op.drop_column("analysis_runs", "sanitize_ms")
