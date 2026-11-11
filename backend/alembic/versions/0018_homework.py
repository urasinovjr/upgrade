import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def identifier(name: str, target: str | None = None, **options):
    args = [sa.ForeignKey(target, ondelete="CASCADE")] if target else []
    return sa.Column(name, sa.Uuid(), *args, nullable=False, **options)


def created_at():
    return sa.Column(
        "created_at",
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("clock_timestamp()"),
    )


def upgrade() -> None:
    op.create_table(
        "homeworks",
        identifier("id", primary_key=True),
        identifier("teacher_id", "users.id"),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("tasks", JSONB(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True)),
        sa.Column("deadline", sa.DateTime(timezone=True)),
        created_at(),
        sa.UniqueConstraint("id", "teacher_id"),
    )
    op.create_table(
        "homework_files",
        identifier("id", primary_key=True),
        identifier("teacher_id", "users.id"),
        identifier("homework_id"),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(32), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("pages", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(300), nullable=False, unique=True),
        sa.Column("masks", JSONB(), nullable=False),
        sa.Column("checked_pages", JSONB(), nullable=False),
        sa.ForeignKeyConstraint(
            ["homework_id", "teacher_id"],
            ["homeworks.id", "homeworks.teacher_id"],
            ondelete="CASCADE",
        ),
    )
    op.create_table(
        "assignments",
        identifier("id", primary_key=True),
        identifier("teacher_id"),
        identifier("student_id"),
        identifier("homework_id"),
        created_at(),
        sa.UniqueConstraint("homework_id", "student_id"),
        sa.UniqueConstraint("id", "teacher_id", "student_id"),
        sa.ForeignKeyConstraint(
            ["homework_id", "teacher_id"],
            ["homeworks.id", "homeworks.teacher_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["student_id", "teacher_id"],
            ["students.id", "students.teacher_id"],
            ondelete="CASCADE",
        ),
    )
    op.create_table(
        "student_access",
        identifier("student_id", "students.id", primary_key=True),
        identifier("user_id", "users.id", unique=True),
        sa.Column("login", sa.String(64), nullable=False, unique=True),
        sa.Column("invitation_hash", sa.String(64), unique=True),
        sa.Column("invitation_expires_at", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "homework_jobs",
        identifier("id", primary_key=True),
        identifier("teacher_id", "users.id"),
        sa.Column("homework_id", sa.Uuid(), sa.ForeignKey("homeworks.id", ondelete="CASCADE")),
        sa.Column("work_id", sa.Uuid(), sa.ForeignKey("works.id", ondelete="CASCADE")),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("input", JSONB(), nullable=False),
        sa.Column("result", JSONB()),
        sa.Column("provenance", JSONB(), nullable=False),
        sa.Column("job_id", sa.Uuid()),
        created_at(),
    )
    op.add_column(
        "works",
        sa.Column("assignment_id", sa.Uuid(), sa.ForeignKey("assignments.id", ondelete="SET NULL")),
    )
    op.create_index("ix_works_assignment_id", "works", ["assignment_id"])
    op.add_column("works", sa.Column("submission_snapshot", JSONB()))
    op.add_column("works", sa.Column("task_files", JSONB()))
    op.add_column("works", sa.Column("submitted_at", sa.DateTime(timezone=True)))
    op.add_column("works", sa.Column("late", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    for column in ("late", "submitted_at", "task_files", "submission_snapshot", "assignment_id"):
        op.drop_column("works", column)
    for table in ("homework_jobs", "student_access", "assignments", "homework_files", "homeworks"):
        op.drop_table(table)
