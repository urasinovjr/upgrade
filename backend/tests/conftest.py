import os
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import Settings
from app.database import make_engine, make_session_factory
from app.main import create_app
from app.models import Base
from app.provider import Provider, ProviderError
from app.queue import WorkerContext
from app.stand import WorkCreate
from tests.accounts import sign_up
from tests.fakes import FakeOAuth, MemoryMailer, MemoryStorage

ROOT = Path(__file__).resolve().parent.parent
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


def table_names() -> str:
    return ", ".join(table.name for table in Base.metadata.sorted_tables)


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
        await connection.execute(text(f"TRUNCATE {table_names()} CASCADE"))
    return make_session_factory(engine)


@pytest.fixture
def test_settings() -> Settings:
    return Settings(
        app_env="test",
        database_url=TEST_DATABASE_URL,
        retry_delay=0.01,
        db_pool_size=10,
        auth_rate_per_minute=1000,
        email_cooldown_seconds=0,
    )


def worker_context(
    sessions,
    settings: Settings,
    provider: Provider | None = None,
    storage: MemoryStorage | None = None,
    mailer: MemoryMailer | None = None,
) -> WorkerContext:
    return WorkerContext(
        sessions,
        provider or FakeProvider(),
        settings,
        storage or MemoryStorage(),
        mailer or MemoryMailer(),
    )


async def make_client(settings: Settings, provider: Provider, oauth: FakeOAuth | None = None):
    app = create_app(settings, provider, MemoryStorage(), MemoryMailer(), oauth or FakeOAuth())
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


@pytest.fixture
def oauth() -> FakeOAuth:
    return FakeOAuth()


@pytest.fixture
async def oauth_client(sessions, test_settings, oauth):
    async for http in make_client(test_settings, FakeProvider(), oauth):
        yield http


@pytest.fixture
async def teacher(sessions, test_settings):
    async for http in make_client(test_settings, FakeProvider()):
        await sign_up(http, sessions, "first@example.com")
        yield http


@pytest.fixture
async def other_teacher(sessions, test_settings):
    async for http in make_client(test_settings, FakeProvider()):
        await sign_up(http, sessions, "second@example.com")
        yield http
