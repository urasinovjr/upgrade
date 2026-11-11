import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "analysis_runs", sa.Column("provider_calls", JSONB(), nullable=False, server_default="[]")
    )
    op.add_column("analysis_runs", sa.Column("actual_cost_usd", sa.Numeric(16, 10), nullable=True))


def downgrade() -> None:
    op.drop_column("analysis_runs", "actual_cost_usd")
    op.drop_column("analysis_runs", "provider_calls")
