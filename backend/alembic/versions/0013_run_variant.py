import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "analysis_runs",
        sa.Column("variant", sa.String(64), server_default="", nullable=False),
    )
    op.add_column(
        "analysis_runs",
        sa.Column("code_commit", sa.String(40), server_default="", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("analysis_runs", "code_commit")
    op.drop_column("analysis_runs", "variant")
