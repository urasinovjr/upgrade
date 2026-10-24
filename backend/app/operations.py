from pathlib import Path

import aiosmtplib
from alembic.script import ScriptDirectory
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.access.models import User
from app.analysis.providers import ProviderNotConfigured, make_provider
from app.analysis.variants import UnknownVariant, get_variant
from app.config import Settings
from app.files import Storage
from app.files.storage import StorageError
from app.students.models import Student
from app.works.models import AnalysisRun, Work, WorkFile

MIGRATIONS = Path(__file__).resolve().parents[1] / "alembic"
COUNTED = {"users": User, "students": Student, "works": Work, "files": WorkFile}


async def expected_keys(session: AsyncSession) -> set[str]:
    keys = set(await session.scalars(select(WorkFile.storage_key)))
    for pages in await session.scalars(select(AnalysisRun.sent_pages)):
        keys |= {page["key"] for page in pages or [] if page.get("key")}
    return keys


async def verify_backup(session: AsyncSession, storage: Storage) -> tuple[list[str], list[str]]:
    stored = set(await storage.list_keys(""))
    missing = sorted(await expected_keys(session) - stored)
    counts = [
        f"{name}: {await session.scalar(select(func.count()).select_from(model))}"
        for name, model in COUNTED.items()
    ]
    counts.append(f"objects: {len(stored)}")
    return counts, [f"нет файла {key}" for key in missing]


def migration_head() -> str | None:
    return ScriptDirectory(str(MIGRATIONS)).get_current_head()


async def database_problems(session: AsyncSession) -> list[str]:
    try:
        current = await session.scalar(text("SELECT version_num FROM alembic_version"))
    except (SQLAlchemyError, OSError):
        return ["база данных недоступна или не размечена миграциями"]
    head = migration_head()
    if current != head:
        return [f"миграции не применены: в базе {current}, последняя {head}"]
    return []


async def storage_problems(storage: Storage) -> list[str]:
    try:
        await storage.check()
    except StorageError:
        return ["хранилище файлов недоступно"]
    return []


async def provider_problems(settings: Settings) -> list[str]:
    try:
        provider = make_provider(get_variant(settings.analysis_variant), settings)
    except (UnknownVariant, ProviderNotConfigured) as error:
        return [f"вариант разбора не настроен: {error}"]
    await provider.close()
    return []


async def mail_problems(settings: Settings) -> list[str]:
    client = aiosmtplib.SMTP(
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        use_tls=settings.smtp_tls == "tls",
        start_tls=settings.smtp_tls == "starttls",
        timeout=settings.smtp_timeout,
    )
    try:
        await client.connect()
        await client.quit()
    except (aiosmtplib.SMTPException, OSError):
        return ["почтовый сервер недоступен"]
    return []
