import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def rename_stand_tables() -> None:
    op.rename_table("works", "stand_works")
    op.execute("ALTER TABLE stand_works RENAME CONSTRAINT works_pkey TO stand_works_pkey")
    op.execute(
        "ALTER TABLE stand_works RENAME CONSTRAINT works_teacher_id_idempotency_key_key "
        "TO stand_works_teacher_id_idempotency_key_key"
    )
    op.execute("ALTER INDEX ix_works_upload_id RENAME TO ix_stand_works_upload_id")
    op.rename_table("results", "stand_results")
    op.execute("ALTER TABLE stand_results RENAME CONSTRAINT results_pkey TO stand_results_pkey")
    op.execute(
        "ALTER TABLE stand_results RENAME CONSTRAINT results_work_id_key "
        "TO stand_results_work_id_key"
    )
    op.execute(
        "ALTER TABLE stand_results RENAME CONSTRAINT results_work_id_fkey "
        "TO stand_results_work_id_fkey"
    )


def upgrade() -> None:
    rename_stand_tables()
    op.drop_constraint("jobs_work_id_fkey", "jobs", type_="foreignkey")
    op.drop_constraint("jobs_work_id_key", "jobs", type_="unique")
    op.alter_column("jobs", "work_id", new_column_name="subject_id")
    op.add_column(
        "jobs",
        sa.Column("kind", sa.String(32), nullable=False, server_default="stand_analysis"),
    )
    op.add_column(
        "jobs", sa.Column("payload", JSONB(), nullable=False, server_default=sa.text("'{}'"))
    )
    op.add_column("jobs", sa.Column("dedupe_key", sa.String(128), unique=True))
    op.add_column(
        "jobs", sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="5")
    )
    op.execute("UPDATE jobs SET dedupe_key = 'stand:' || subject_id")
    op.alter_column("jobs", "kind", server_default=None)
    op.alter_column("jobs", "payload", server_default=None)
    op.alter_column("jobs", "max_attempts", server_default=None)
    op.create_index("ix_jobs_kind_subject_id", "jobs", ["kind", "subject_id"])


def downgrade() -> None:
    op.drop_index("ix_jobs_kind_subject_id", "jobs")
    op.execute("DELETE FROM jobs WHERE kind <> 'stand_analysis'")
    op.drop_column("jobs", "max_attempts")
    op.drop_column("jobs", "dedupe_key")
    op.drop_column("jobs", "payload")
    op.drop_column("jobs", "kind")
    op.alter_column("jobs", "subject_id", new_column_name="work_id")
    op.rename_table("stand_results", "results")
    op.execute("ALTER TABLE results RENAME CONSTRAINT stand_results_pkey TO results_pkey")
    op.execute(
        "ALTER TABLE results RENAME CONSTRAINT stand_results_work_id_key TO results_work_id_key"
    )
    op.execute(
        "ALTER TABLE results RENAME CONSTRAINT stand_results_work_id_fkey TO results_work_id_fkey"
    )
    op.rename_table("stand_works", "works")
    op.execute("ALTER TABLE works RENAME CONSTRAINT stand_works_pkey TO works_pkey")
    op.execute(
        "ALTER TABLE works RENAME CONSTRAINT stand_works_teacher_id_idempotency_key_key "
        "TO works_teacher_id_idempotency_key_key"
    )
    op.execute("ALTER INDEX ix_stand_works_upload_id RENAME TO ix_works_upload_id")
    op.create_unique_constraint("jobs_work_id_key", "jobs", ["work_id"])
    op.create_foreign_key("jobs_work_id_fkey", "jobs", "works", ["work_id"], ["id"])
