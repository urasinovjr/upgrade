from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def now_column() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.clock_timestamp())


def make_engine(url: str, pool_size: int = 5) -> AsyncEngine:
    return create_async_engine(url, pool_size=pool_size, max_overflow=0, pool_pre_ping=True)


def make_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)
