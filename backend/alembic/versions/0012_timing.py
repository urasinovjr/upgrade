import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def now() -> sa.Column:
    return sa.Column(
        "created_at",
        sa.DateTime(timezone=True),
        server_default=sa.func.clock_timestamp(),
        nullable=False,
    )


def teacher() -> sa.Column:
    return sa.Column(
        "teacher_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )


def upgrade() -> None:
    op.create_table(
        "pilot_participants",
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("note", sa.String(200), nullable=False),
        sa.Column(
            "enrolled_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.clock_timestamp(),
            nullable=False,
        ),
    )
    op.create_table(
        "active_intervals",
        sa.Column("id", sa.Uuid(), primary_key=True),
        teacher(),
        sa.Column("work_id", sa.Uuid(), nullable=False),
        sa.Column("stage", sa.String(16), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=False),
        now(),
        sa.ForeignKeyConstraint(
            ["work_id", "teacher_id"], ["works.id", "works.teacher_id"], ondelete="CASCADE"
        ),
        sa.CheckConstraint(
            "stage IN ('preparation', 'masking', 'review', 'export')",
            name="ck_active_intervals_stage",
        ),
        sa.CheckConstraint("ended_at > started_at", name="ck_active_intervals_order"),
    )
    op.create_index("ix_active_intervals_work", "active_intervals", ["work_id"])
    op.create_table(
        "manual_sessions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        teacher(),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("task_count", sa.Integer(), nullable=False),
        sa.Column("task_family", sa.String(32), nullable=False),
        sa.Column("active_seconds", sa.Integer(), nullable=False),
        sa.Column("corrected_seconds", sa.Integer()),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=False),
        now(),
        sa.ForeignKeyConstraint(
            ["student_id", "teacher_id"],
            ["students.id", "students.teacher_id"],
            ondelete="CASCADE",
        ),
        sa.CheckConstraint("task_count BETWEEN 1 AND 100", name="ck_manual_sessions_tasks"),
        sa.CheckConstraint("active_seconds >= 0", name="ck_manual_sessions_active"),
        sa.CheckConstraint(
            "corrected_seconds IS NULL OR corrected_seconds >= 0",
            name="ck_manual_sessions_corrected",
        ),
    )
    op.create_index("ix_manual_sessions_teacher", "manual_sessions", ["teacher_id", "finished_at"])


def downgrade() -> None:
    op.drop_index("ix_manual_sessions_teacher", table_name="manual_sessions")
    op.drop_table("manual_sessions")
    op.drop_index("ix_active_intervals_work", table_name="active_intervals")
    op.drop_table("active_intervals")
    op.drop_table("pilot_participants")
