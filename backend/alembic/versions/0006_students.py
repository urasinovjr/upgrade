import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def created_at(name: str = "created_at") -> sa.Column:
    return sa.Column(
        name, sa.DateTime(timezone=True), server_default=sa.func.clock_timestamp(), nullable=False
    )


def teacher_id() -> sa.Column:
    return sa.Column(
        "teacher_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )


def upgrade() -> None:
    op.create_table(
        "user_preferences",
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("value", JSONB(), nullable=False),
        created_at("updated_at"),
    )
    op.create_table(
        "students",
        sa.Column("id", sa.Uuid(), primary_key=True),
        teacher_id(),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("grade", sa.Integer(), nullable=False),
        sa.Column("goal", sa.String(500), nullable=False),
        sa.Column("color", sa.String(16), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        created_at(),
        sa.UniqueConstraint("id", "teacher_id"),
        sa.CheckConstraint("grade BETWEEN 9 AND 11", name="ck_students_grade"),
        sa.CheckConstraint("color IN ('teal', 'sand', 'lilac', 'blue')", name="ck_students_color"),
    )
    op.create_index("ix_students_teacher_id", "students", ["teacher_id"])
    op.create_table(
        "closures",
        sa.Column("id", sa.Uuid(), primary_key=True),
        teacher_id(),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("topic_id", sa.String(64), nullable=False),
        sa.Column("action", sa.String(8), nullable=False),
        sa.Column("note", sa.String(2000), nullable=False),
        created_at(),
        sa.ForeignKeyConstraint(
            ["student_id", "teacher_id"],
            ["students.id", "students.teacher_id"],
            ondelete="CASCADE",
        ),
        sa.CheckConstraint("action IN ('close', 'reopen')", name="ck_closures_action"),
    )
    op.create_index("ix_closures_teacher_id", "closures", ["teacher_id"])
    op.create_index("ix_closures_student_created", "closures", ["student_id", "created_at"])


def downgrade() -> None:
    op.drop_table("closures")
    op.drop_table("students")
    op.drop_table("user_preferences")
