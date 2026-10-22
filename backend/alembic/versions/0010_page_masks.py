import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("work_files", sa.Column("masks", JSONB(), server_default="{}", nullable=False))
    op.add_column(
        "work_files", sa.Column("checked_pages", JSONB(), server_default="[]", nullable=False)
    )


def downgrade() -> None:
    op.drop_column("work_files", "checked_pages")
    op.drop_column("work_files", "masks")
