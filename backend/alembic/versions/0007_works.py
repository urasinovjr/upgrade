import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def created_at() -> sa.Column:
    return sa.Column(
        "created_at",
        sa.DateTime(timezone=True),
        server_default=sa.func.clock_timestamp(),
        nullable=False,
    )


def teacher_id() -> sa.Column:
    return sa.Column(
        "teacher_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )


def upgrade() -> None:
    op.create_table(
        "works",
        sa.Column("id", sa.Uuid(), primary_key=True),
        teacher_id(),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("editing", sa.Boolean(), nullable=False),
        sa.Column("manual", sa.Boolean(), nullable=False),
        sa.Column("draft", JSONB(), nullable=False),
        sa.Column("current_revision_id", sa.Uuid()),
        sa.Column("analysis_job_id", sa.Uuid()),
        created_at(),
        sa.UniqueConstraint("id", "teacher_id"),
        sa.ForeignKeyConstraint(
            ["student_id", "teacher_id"],
            ["students.id", "students.teacher_id"],
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "status IN ('preparation', 'queued', 'processing', 'needs_input', 'ready', "
            "'confirmed', 'failed')",
            name="ck_works_status",
        ),
    )
    op.create_index("ix_works_teacher_created", "works", ["teacher_id", "created_at"])
    op.create_table(
        "work_files",
        sa.Column("id", sa.Uuid(), primary_key=True),
        teacher_id(),
        sa.Column("work_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(32), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("pages", sa.Integer(), nullable=False),
        sa.Column("page_order", JSONB(), nullable=False),
        sa.Column("crops", JSONB(), nullable=False),
        sa.Column("storage_key", sa.String(300), nullable=False, unique=True),
        created_at(),
        sa.ForeignKeyConstraint(
            ["work_id", "teacher_id"], ["works.id", "works.teacher_id"], ondelete="CASCADE"
        ),
        sa.CheckConstraint(
            "content_type IN ('image/jpeg', 'image/png', 'application/pdf')",
            name="ck_work_files_type",
        ),
    )
    op.create_index("ix_work_files_teacher_id", "work_files", ["teacher_id"])
    op.create_index("ix_work_files_work_position", "work_files", ["work_id", "position"])
    op.create_table(
        "work_revisions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "work_id", sa.Uuid(), sa.ForeignKey("works.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("draft", JSONB(), nullable=False),
        sa.Column("attachments", JSONB(), nullable=False),
        sa.UniqueConstraint("work_id", "number"),
    )


def downgrade() -> None:
    op.drop_table("work_revisions")
    op.drop_table("work_files")
    op.drop_table("works")
