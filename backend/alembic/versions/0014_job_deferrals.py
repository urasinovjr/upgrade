import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("jobs", sa.Column("deferrals", sa.Integer(), server_default="0", nullable=False))


def downgrade() -> None:
    op.drop_column("jobs", "deferrals")
