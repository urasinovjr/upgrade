import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
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
        "works",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("teacher_id", sa.String(64), nullable=False),
        sa.Column("student_id", sa.String(64), nullable=False),
        sa.Column("upload_id", sa.String(64), nullable=False),
        sa.Column("idempotency_key", sa.String(64)),
        sa.Column("pages", sa.Integer(), nullable=False),
        created_at(),
        sa.UniqueConstraint("teacher_id", "idempotency_key"),
    )
    op.create_index("ix_works_upload_id", "works", ["upload_id"])
    op.create_table(
        "jobs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("work_id", sa.Uuid(), sa.ForeignKey("works.id"), nullable=False, unique=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column(
            "run_after",
            sa.DateTime(timezone=True),
            server_default=sa.func.clock_timestamp(),
            nullable=False,
        ),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.String(64)),
        created_at(),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_jobs_status_run_after", "jobs", ["status", "run_after"])
    op.create_table(
        "results",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("work_id", sa.Uuid(), sa.ForeignKey("works.id"), nullable=False, unique=True),
        sa.Column("text", sa.String(), nullable=False),
        sa.Column("analysis", sa.JSON(), nullable=False),
        created_at(),
    )


def downgrade() -> None:
    op.drop_table("results")
    op.drop_table("jobs")
    op.drop_table("works")
