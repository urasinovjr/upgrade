import os
import subprocess
import sys

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.models import Base
from tests.conftest import ADMIN_URL, ROOT

SCRATCH_URL = os.environ.get(
    "TEST_MIGRATIONS_URL",
    "postgresql+asyncpg://upgrade:upgrade@localhost:5433/upgrade_migrations",
)


async def recreate_scratch_database() -> None:
    admin = create_async_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    try:
        async with admin.connect() as connection:
            await connection.execute(text("DROP DATABASE IF EXISTS upgrade_migrations"))
            await connection.execute(text("CREATE DATABASE upgrade_migrations"))
    finally:
        await admin.dispose()


def differences(connection) -> list:
    context = MigrationContext.configure(connection, opts={"compare_type": True})
    return compare_metadata(context, Base.metadata)


async def test_migrations_match_models(engine):
    await recreate_scratch_database()
    environment = {**os.environ, "DATABASE_URL": SCRATCH_URL}
    command = [sys.executable, "-m", "alembic", "upgrade", "head"]
    finished = subprocess.run(command, cwd=ROOT, env=environment, capture_output=True, text=True)
    if finished.returncode != 0:
        pytest.fail(finished.stderr)

    scratch = create_async_engine(SCRATCH_URL)
    try:
        async with scratch.connect() as connection:
            found = await connection.run_sync(differences)
    finally:
        await scratch.dispose()
    assert found == []
