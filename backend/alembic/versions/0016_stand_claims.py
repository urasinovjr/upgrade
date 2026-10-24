import sqlalchemy as sa
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stand_works", sa.Column("claimed_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    op.drop_column("stand_works", "claimed_at")
