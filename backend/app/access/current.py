import hmac
from dataclasses import dataclass

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.access.models import AuthSession, User
from app.access.sessions import find_session
from app.config import Settings
from app.errors import DomainError

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


@dataclass
class CurrentAccount:
    user: User
    session: AuthSession
    token: str


def check_origin(request: Request, settings: Settings) -> None:
    if request.method in SAFE_METHODS:
        return
    origin = request.headers.get("origin")
    allowed = {*settings.allowed_origins, settings.public_url.rstrip("/")}
    if origin is not None and origin not in allowed:
        raise DomainError("origin_forbidden")


async def load_current_account(
    request: Request, session: AsyncSession, settings: Settings
) -> CurrentAccount:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise DomainError("not_authenticated")
    found = await find_session(session, token)
    if found is None:
        raise DomainError("not_authenticated")
    auth_session, user = found
    if request.method not in SAFE_METHODS:
        submitted = request.headers.get("x-csrf-token", "")
        if not hmac.compare_digest(submitted.encode(), auth_session.csrf_token.encode()):
            raise DomainError("csrf_failed")
    return CurrentAccount(user=user, session=auth_session, token=token)
