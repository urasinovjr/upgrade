from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.access.email_tokens import issue_email_token, last_token_sent_at, use_email_token
from app.access.models import Consent, User
from app.access.passwords import hash_password, needs_rehash, verify_password
from app.access.rules import lock_until, normalize_email, password_is_weak
from app.access.schemas import RegisterIn
from app.access.sessions import revoke_user_sessions
from app.config import Settings
from app.errors import DomainError
from app.mail import enqueue_email


async def find_user_by_email(session: AsyncSession, email: str) -> User | None:
    return await session.scalar(select(User).where(User.email == normalize_email(email)))


def check_consents(settings: Settings, data: RegisterIn) -> None:
    accepted = data.accept_terms and data.accept_personal_data
    current = (
        data.terms_version == settings.terms_version
        and data.personal_data_version == settings.personal_data_version
    )
    if not accepted or not current:
        raise DomainError("consent_required")


async def record_consents(
    session: AsyncSession, settings: Settings, user: User, ip: str | None
) -> None:
    for kind, version in (
        ("terms", settings.terms_version),
        ("personal_data", settings.personal_data_version),
    ):
        await session.execute(
            insert(Consent)
            .values(user_id=user.id, kind=kind, document_version=version, ip_address=ip)
            .on_conflict_do_nothing(index_elements=["user_id", "kind", "document_version"])
        )


async def cooldown_passed(session: AsyncSession, settings: Settings, user: User, purpose: str):
    last_sent = await last_token_sent_at(session, user.id, purpose)
    if last_sent is None:
        return True
    return datetime.now(UTC) - last_sent >= timedelta(seconds=settings.email_cooldown_seconds)


async def send_confirmation(session: AsyncSession, settings: Settings, user: User) -> None:
    assert user.email is not None
    lifetime = timedelta(hours=settings.confirm_token_hours)
    token = await issue_email_token(session, user.id, "confirm", lifetime)
    await enqueue_email(session, user.id, user.email, "confirm", settings.email_job_attempts, token)


async def register(
    session: AsyncSession, settings: Settings, data: RegisterIn, ip: str | None
) -> None:
    check_consents(settings, data)
    if password_is_weak(data.password, data.email):
        raise DomainError("password_too_weak")
    user = await find_user_by_email(session, data.email)
    if user is not None and user.email_confirmed_at is not None:
        await enqueue_email(
            session,
            user.id,
            normalize_email(data.email),
            "account_exists",
            settings.email_job_attempts,
        )
        await session.commit()
        return
    password_hash = await hash_password(data.password)
    if user is None:
        user = User(email=normalize_email(data.email), display_name=data.display_name)
        session.add(user)
    user.password_hash = password_hash
    user.display_name = data.display_name
    await session.flush()
    await record_consents(session, settings, user, ip)
    if await cooldown_passed(session, settings, user, "confirm"):
        await send_confirmation(session, settings, user)
    await session.commit()


async def resend_confirmation(session: AsyncSession, settings: Settings, email: str) -> None:
    user = await find_user_by_email(session, email)
    if user is None or user.email_confirmed_at is not None:
        return
    if await cooldown_passed(session, settings, user, "confirm"):
        await send_confirmation(session, settings, user)
        await session.commit()


async def confirm_email(session: AsyncSession, token: str) -> User:
    user_id = await use_email_token(session, token, "confirm")
    if user_id is None:
        raise DomainError("token_invalid")
    user = await session.get(User, user_id)
    assert user is not None
    if user.email_confirmed_at is None:
        user.email_confirmed_at = datetime.now(UTC)
    return user


async def request_password_reset(session: AsyncSession, settings: Settings, email: str) -> None:
    user = await find_user_by_email(session, email)
    if user is None or user.email is None:
        return
    if not await cooldown_passed(session, settings, user, "reset"):
        return
    lifetime = timedelta(minutes=settings.reset_token_minutes)
    token = await issue_email_token(session, user.id, "reset", lifetime)
    await enqueue_email(session, user.id, user.email, "reset", settings.email_job_attempts, token)
    await session.commit()


async def reset_password(session: AsyncSession, token: str, password: str) -> None:
    user_id = await use_email_token(session, token, "reset")
    if user_id is None:
        raise DomainError("token_invalid")
    user = await session.get(User, user_id)
    assert user is not None
    if password_is_weak(password, user.email):
        await session.rollback()
        raise DomainError("password_too_weak")
    user.password_hash = await hash_password(password)
    user.failed_logins = 0
    user.locked_until = None
    if user.email_confirmed_at is None:
        user.email_confirmed_at = datetime.now(UTC)
    await revoke_user_sessions(session, user.id)
    await session.commit()


async def record_failed_login(session: AsyncSession, settings: Settings, user: User) -> None:
    failed_logins = await session.scalar(
        update(User)
        .where(User.id == user.id)
        .values(failed_logins=User.failed_logins + 1)
        .returning(User.failed_logins)
    )
    assert failed_logins is not None
    locked = lock_until(
        failed_logins,
        settings.login_lock_threshold,
        settings.login_lock_max_minutes,
        datetime.now(UTC),
    )
    if locked is not None:
        await session.execute(update(User).where(User.id == user.id).values(locked_until=locked))
    await session.commit()


async def login(session: AsyncSession, settings: Settings, email: str, password: str) -> User:
    user = await find_user_by_email(session, email)
    if user is None:
        await verify_password(None, password)
        raise DomainError("invalid_credentials")
    if user.locked_until is not None and user.locked_until > datetime.now(UTC):
        raise DomainError("account_locked")
    if not await verify_password(user.password_hash, password):
        await record_failed_login(session, settings, user)
        raise DomainError("invalid_credentials")
    if user.email_confirmed_at is None:
        raise DomainError("email_not_confirmed")
    assert user.password_hash is not None
    if needs_rehash(user.password_hash):
        user.password_hash = await hash_password(password)
    user.failed_logins = 0
    user.locked_until = None
    user.last_login_at = datetime.now(UTC)
    return user
