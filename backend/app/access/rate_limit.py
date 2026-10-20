from datetime import timedelta

from sqlalchemy import case, func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.access.models import RateLimit
from app.errors import DomainError


async def check_rate_limit(
    session: AsyncSession, bucket: str, limit: int, window_seconds: int = 60
) -> None:
    now = func.clock_timestamp()
    window_over = RateLimit.window_started_at < now - timedelta(seconds=window_seconds)
    statement = insert(RateLimit).values(bucket=bucket, window_started_at=now, hits=1)
    statement = statement.on_conflict_do_update(
        index_elements=["bucket"],
        set_={
            "hits": case((window_over, 1), else_=RateLimit.hits + 1),
            "window_started_at": case((window_over, now), else_=RateLimit.window_started_at),
        },
    ).returning(RateLimit.hits)
    hits = await session.scalar(statement)
    await session.commit()
    if hits is not None and hits > limit:
        raise DomainError("rate_limited")
