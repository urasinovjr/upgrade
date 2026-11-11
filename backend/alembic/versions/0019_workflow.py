import sqlalchemy as sa
from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("active_intervals", "work_id", nullable=True)
    op.add_column("active_intervals", sa.Column("homework_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_active_homework",
        "active_intervals",
        "homeworks",
        ["homework_id", "teacher_id"],
        ["id", "teacher_id"],
        ondelete="CASCADE",
    )
    op.create_check_constraint(
        "ck_active_intervals_target",
        "active_intervals",
        "(work_id IS NULL) <> (homework_id IS NULL)",
    )
    op.drop_constraint("ck_active_intervals_stage", "active_intervals", type_="check")
    op.create_check_constraint(
        "ck_active_intervals_stage",
        "active_intervals",
        "stage IN ('preparation', 'masking', 'review', 'export', 'teacher_upload', 'remediation')",
    )
    op.add_column(
        "homeworks", sa.Column("source_text", sa.Text(), nullable=False, server_default="")
    )
    op.execute(
        "UPDATE homeworks AS homework SET source_text = COALESCE(("
        "SELECT job.input->>'text' FROM homework_jobs AS job "
        "WHERE job.homework_id = homework.id AND job.kind = 'condition_recognition' "
        "ORDER BY job.created_at DESC, job.id DESC LIMIT 1), '')"
    )
    op.create_table(
        "product_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "teacher_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("kind", sa.String(48), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("app_version", sa.String(32), nullable=False),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("clock_timestamp()"),
        ),
        sa.UniqueConstraint("teacher_id", "kind", "entity_id", "revision"),
    )
    op.create_index(
        "ix_product_events_teacher_time", "product_events", ["teacher_id", "occurred_at"]
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM active_intervals WHERE homework_id IS NOT NULL "
        "OR stage IN ('teacher_upload', 'remediation')"
    )
    op.drop_constraint("ck_active_intervals_stage", "active_intervals", type_="check")
    op.create_check_constraint(
        "ck_active_intervals_stage",
        "active_intervals",
        "stage IN ('preparation', 'masking', 'review', 'export')",
    )
    op.drop_constraint("ck_active_intervals_target", "active_intervals", type_="check")
    op.drop_constraint("fk_active_homework", "active_intervals", type_="foreignkey")
    op.drop_column("active_intervals", "homework_id")
    op.alter_column("active_intervals", "work_id", nullable=False)
    op.drop_table("product_events")
    op.drop_column("homeworks", "source_text")
