from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.access.models import EmailToken
from app.access.rules import new_token, token_hash


async def issue_email_token(
    session: AsyncSession, user_id: UUID, purpose: str, lifetime: timedelta
) -> str:
    now = datetime.now(UTC)
    await session.execute(
        update(EmailToken)
        .where(
            EmailToken.user_id == user_id,
            EmailToken.purpose == purpose,
            EmailToken.used_at.is_(None),
        )
        .values(used_at=now)
    )
    token = new_token()
    session.add(
        EmailToken(
            user_id=user_id,
            purpose=purpose,
            token_hash=token_hash(token),
            expires_at=now + lifetime,
        )
    )
    return token


async def use_email_token(session: AsyncSession, token: str, purpose: str) -> UUID | None:
    now = datetime.now(UTC)
    return await session.scalar(
        update(EmailToken)
        .where(
            EmailToken.token_hash == token_hash(token),
            EmailToken.purpose == purpose,
            EmailToken.used_at.is_(None),
            EmailToken.expires_at > now,
        )
        .values(used_at=now)
        .returning(EmailToken.user_id)
    )


async def last_token_sent_at(session: AsyncSession, user_id: UUID, purpose: str):
    return await session.scalar(
        select(func.max(EmailToken.created_at)).where(
            EmailToken.user_id == user_id, EmailToken.purpose == purpose
        )
    )
