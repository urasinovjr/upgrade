import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "analysis_runs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "work_id", sa.Uuid(), sa.ForeignKey("works.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("job_id", sa.Uuid(), nullable=False),
        sa.Column("input_revision", sa.Integer(), nullable=False),
        sa.Column("recognized", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("error", sa.String(64)),
        sa.Column("provider", sa.String(64), nullable=False),
        sa.Column("model", sa.String(64), nullable=False),
        sa.Column("prompt_version", sa.String(64), nullable=False),
        sa.Column("input", JSONB(), nullable=False),
        sa.Column("recognition", JSONB()),
        sa.Column("review", JSONB()),
        sa.Column("draft", JSONB()),
        sa.Column("recognize_ms", sa.Integer()),
        sa.Column("review_ms", sa.Integer()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.clock_timestamp(),
            nullable=False,
        ),
        sa.CheckConstraint("status IN ('succeeded', 'failed')", name="ck_analysis_runs_status"),
    )
    op.create_index("ix_analysis_runs_work_id", "analysis_runs", ["work_id"])
    op.add_column("works", sa.Column("analysis_run_id", sa.Uuid()))
    op.add_column("work_revisions", sa.Column("analysis_run_id", sa.Uuid()))


def downgrade() -> None:
    op.drop_column("work_revisions", "analysis_run_id")
    op.drop_column("works", "analysis_run_id")
    op.drop_index("ix_analysis_runs_work_id", table_name="analysis_runs")
    op.drop_table("analysis_runs")
