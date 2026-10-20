import json
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.access.models import UserPreference
from app.errors import DomainError

MAX_PREFERENCE_BYTES = 16 * 1024


async def read_preference(session: AsyncSession, user_id: UUID, key: str) -> dict | None:
    preference = await session.get(UserPreference, (user_id, key))
    return preference.value if preference else None


async def save_preference(session: AsyncSession, user_id: UUID, key: str, value: dict) -> None:
    if len(json.dumps(value, ensure_ascii=False).encode()) > MAX_PREFERENCE_BYTES:
        raise DomainError("preference_too_large")
    await session.execute(
        insert(UserPreference)
        .values(user_id=user_id, key=key, value=value)
        .on_conflict_do_update(
            index_elements=["user_id", "key"],
            set_={"value": value, "updated_at": func.clock_timestamp()},
        )
    )
    await session.commit()
