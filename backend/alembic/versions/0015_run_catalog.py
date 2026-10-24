import sqlalchemy as sa
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "analysis_runs",
        sa.Column("catalog_version", sa.String(32), server_default="", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("analysis_runs", "catalog_version")
