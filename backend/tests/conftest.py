import os

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import Settings
from app.database import Base, make_engine, make_session_factory
from app.main import create_app
from app.provider import Provider, ProviderError
from app.schemas import WorkCreate

ADMIN_URL = os.environ.get(
    "TEST_ADMIN_URL", "postgresql+asyncpg://upgrade:upgrade@localhost:5433/upgrade"
)
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://upgrade:upgrade@localhost:5433/upgrade_test"
)


class FakeProvider(Provider):
    def __init__(self, failures: int = 0):
        self.failures = failures
        self.calls = 0

    async def recognize(self, upload_id: str, pages: int) -> str:
        self.calls += 1
        if self.failures > 0:
            self.failures -= 1
            raise ProviderError("provider_unavailable")
        return f"text of {upload_id}"

    async def analyze(self, upload_id: str, text: str) -> dict:
        return {"steps": 3}

    async def close(self) -> None:
        pass


def work_data() -> WorkCreate:
    return WorkCreate(teacher_id="teacher-1", student_id="student-1", pages=2)


async def create_test_database() -> None:
    admin = create_async_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    try:
        async with admin.connect() as connection:
            exists = await connection.scalar(
                text("SELECT 1 FROM pg_database WHERE datname = 'upgrade_test'")
            )
            if not exists:
                await connection.execute(text("CREATE DATABASE upgrade_test"))
    finally:
        await admin.dispose()


@pytest.fixture(scope="session")
async def engine():
    try:
        await create_test_database()
    except OSError:
        pytest.skip("PostgreSQL from docker compose is not running")
    test_engine = make_engine(TEST_DATABASE_URL, pool_size=10)
    async with test_engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    yield test_engine
    await test_engine.dispose()


@pytest.fixture
async def sessions(engine):
    async with engine.begin() as connection:
        await connection.execute(text("TRUNCATE results, jobs, works"))
    return make_session_factory(engine)


@pytest.fixture
def test_settings() -> Settings:
    return Settings(database_url=TEST_DATABASE_URL, retry_delay=0.01, db_pool_size=10)


async def make_client(settings: Settings, provider: Provider):
    app = create_app(settings, provider)
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client


@pytest.fixture
async def client(sessions, test_settings):
    async for http in make_client(test_settings, FakeProvider()):
        yield http


@pytest.fixture
async def failing_client(sessions, test_settings):
    async for http in make_client(test_settings, FakeProvider(failures=10)):
        yield http
