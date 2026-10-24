from pathlib import Path
from time import time

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.files import Storage
from app.files.storage import StorageError


async def unavailable_parts(
    sessions: async_sessionmaker[AsyncSession], storage: Storage
) -> list[str]:
    failed = []
    try:
        async with sessions() as session:
            await session.execute(text("SELECT 1"))
    except (SQLAlchemyError, OSError):
        failed.append("database")
    try:
        await storage.check()
    except StorageError:
        failed.append("storage")
    return failed


def write_heartbeat(path: Path) -> None:
    path.write_text(str(time()))


def heartbeat_is_fresh(path: Path, max_age: float) -> bool:
    try:
        return time() - path.stat().st_mtime <= max_age
    except OSError:
        return False
