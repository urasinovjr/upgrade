from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.provider import Provider


@dataclass
class WorkerContext:
    sessions: async_sessionmaker[AsyncSession]
    provider: Provider
    settings: Settings
