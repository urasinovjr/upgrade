import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.access.models import AuthSession, User
from app.access.rules import new_token, token_hash


async def create_session(session: AsyncSession, user_id: UUID, days: int) -> tuple[str, str]:
    token = new_token()
    csrf_token = secrets.token_urlsafe(32)
    session.add(
        AuthSession(
            user_id=user_id,
            token_hash=token_hash(token),
            csrf_token=csrf_token,
            expires_at=datetime.now(UTC) + timedelta(days=days),
        )
    )
    return token, csrf_token


async def find_session(session: AsyncSession, token: str) -> tuple[AuthSession, User] | None:
    query = (
        select(AuthSession, User)
        .join(User, User.id == AuthSession.user_id)
        .where(
            AuthSession.token_hash == token_hash(token),
            AuthSession.expires_at > datetime.now(UTC),
        )
    )
    row = (await session.execute(query)).first()
    if row is None:
        return None
    return row[0], row[1]


async def revoke_session(session: AsyncSession, token: str) -> None:
    await session.execute(delete(AuthSession).where(AuthSession.token_hash == token_hash(token)))


async def revoke_user_sessions(session: AsyncSession, user_id: UUID) -> None:
    await session.execute(delete(AuthSession).where(AuthSession.user_id == user_id))
