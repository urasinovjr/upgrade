import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("analysis_runs", sa.Column("request_id", sa.String(64)))
    op.add_column("analysis_runs", sa.Column("queued_ms", sa.Integer()))
    op.add_column(
        "analysis_runs",
        sa.Column("input_tokens", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "analysis_runs",
        sa.Column("output_tokens", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "analysis_runs",
        sa.Column("cost", sa.Numeric(12, 6), server_default="0", nullable=False),
    )
    op.add_column(
        "analysis_runs",
        sa.Column("cost_currency", sa.String(8), server_default="", nullable=False),
    )
    op.create_index("ix_analysis_runs_created_at", "analysis_runs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_analysis_runs_created_at", table_name="analysis_runs")
    columns = ("cost_currency", "cost", "output_tokens", "input_tokens", "queued_ms", "request_id")
    for column in columns:
        op.drop_column("analysis_runs", column)
