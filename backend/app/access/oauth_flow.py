import hmac
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.access.accounts import find_user_by_email, record_consents
from app.access.models import OAuthIdentity, OAuthState, User
from app.access.oauth_client import OAuthClient, OAuthError, OAuthProfile
from app.access.rules import new_token, token_hash
from app.billing import start_trial
from app.config import Settings
from app.errors import DomainError


@dataclass
class OAuthOutcome:
    kind: str
    user: User


def redirect_uri(settings: Settings, provider: str) -> str:
    return f"{settings.public_url.rstrip('/')}/auth/callback/{provider}"


def consents_are_current(settings: Settings, state: OAuthState) -> bool:
    return (
        state.terms_version == settings.terms_version
        and state.personal_data_version == settings.personal_data_version
    )


async def start_oauth(
    session: AsyncSession,
    settings: Settings,
    oauth: OAuthClient,
    provider: str,
    user_id: UUID | None = None,
    consents: tuple[str, str] | None = None,
) -> tuple[str, str]:
    if provider not in oauth.enabled_providers():
        raise DomainError("oauth_provider_unknown")
    now = datetime.now(UTC)
    await session.execute(delete(OAuthState).where(OAuthState.expires_at < now))
    state = new_token()
    verifier = secrets.token_urlsafe(64)
    terms_version, personal_data_version = consents or (None, None)
    session.add(
        OAuthState(
            state_hash=token_hash(state),
            provider=provider,
            purpose="link" if user_id else "login",
            code_verifier=verifier,
            user_id=user_id,
            terms_version=terms_version,
            personal_data_version=personal_data_version,
            expires_at=now + timedelta(minutes=settings.oauth_state_minutes),
        )
    )
    await session.commit()
    return state, oauth.authorize_url(provider, state, verifier, redirect_uri(settings, provider))


async def take_state(
    session: AsyncSession, provider: str, state: str, cookie_state: str | None
) -> OAuthState:
    if not cookie_state or not hmac.compare_digest(state.encode(), cookie_state.encode()):
        raise DomainError("oauth_state_invalid")
    stored = await session.scalar(
        delete(OAuthState)
        .where(
            OAuthState.state_hash == token_hash(state),
            OAuthState.provider == provider,
            OAuthState.expires_at > datetime.now(UTC),
        )
        .returning(OAuthState)
    )
    await session.commit()
    if stored is None:
        raise DomainError("oauth_state_invalid")
    return stored


async def link_identity(
    session: AsyncSession, user_id: UUID, provider: str, profile: OAuthProfile
) -> User:
    taken = await session.scalar(
        select(OAuthIdentity).where(
            OAuthIdentity.user_id == user_id, OAuthIdentity.provider == provider
        )
    )
    if taken is not None:
        raise DomainError("oauth_identity_taken")
    session.add(
        OAuthIdentity(
            user_id=user_id, provider=provider, subject=profile.subject, email=profile.email
        )
    )
    user = await session.get(User, user_id)
    assert user is not None
    return user


async def sign_up_with_provider(
    session: AsyncSession,
    settings: Settings,
    state: OAuthState,
    profile: OAuthProfile,
    ip: str | None,
) -> User:
    if profile.email and await find_user_by_email(session, profile.email):
        raise DomainError("oauth_email_taken")
    if not consents_are_current(settings, state):
        raise DomainError("oauth_signup_requires_consent")
    user = User(
        email=profile.email.lower() if profile.email else None,
        email_confirmed_at=datetime.now(UTC) if profile.email else None,
        display_name=profile.display_name,
    )
    session.add(user)
    await session.flush()
    await record_consents(session, settings, user, ip)
    await start_trial(session, user.id, settings.trial_days)
    await link_identity(session, user.id, state.provider, profile)
    return user


async def finish_oauth(
    session: AsyncSession,
    settings: Settings,
    oauth: OAuthClient,
    state: OAuthState,
    code: str,
    device_id: str | None,
    ip: str | None,
) -> OAuthOutcome:
    try:
        profile = await oauth.fetch_profile(
            state.provider,
            code,
            state.code_verifier,
            redirect_uri(settings, state.provider),
            device_id,
        )
    except OAuthError as error:
        raise DomainError("oauth_failed") from error
    identity = await session.scalar(
        select(OAuthIdentity).where(
            OAuthIdentity.provider == state.provider, OAuthIdentity.subject == profile.subject
        )
    )
    if state.purpose == "link":
        assert state.user_id is not None
        if identity is not None and identity.user_id != state.user_id:
            raise DomainError("oauth_identity_taken")
        user = await session.get(User, state.user_id)
        if identity is None:
            user = await link_identity(session, state.user_id, state.provider, profile)
        assert user is not None
        await session.commit()
        return OAuthOutcome("linked", user)
    if identity is not None:
        user = await session.get(User, identity.user_id)
        assert user is not None
        user.last_login_at = datetime.now(UTC)
        return OAuthOutcome("session", user)
    user = await sign_up_with_provider(session, settings, state, profile, ip)
    return OAuthOutcome("session", user)


async def unlink_identity(session: AsyncSession, user: User, provider: str) -> None:
    identities = list(
        await session.scalars(select(OAuthIdentity).where(OAuthIdentity.user_id == user.id))
    )
    target = next((item for item in identities if item.provider == provider), None)
    if target is None:
        raise DomainError("oauth_identity_not_found")
    if user.password_hash is None and len(identities) == 1:
        raise DomainError("last_login_method")
    await session.delete(target)
    await session.commit()
