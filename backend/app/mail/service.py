from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.queue import Job, enqueue

SEND_EMAIL_JOB = "send_email"


async def enqueue_email(
    session: AsyncSession,
    user_id: UUID,
    to: str,
    template: str,
    max_attempts: int,
    token: str | None = None,
) -> Job:
    payload = {"to": to, "template": template}
    if token is not None:
        payload["token"] = token
    return await enqueue(session, SEND_EMAIL_JOB, user_id, max_attempts, payload)
