from typing import Literal

from fastapi import APIRouter, Depends, Request, Response, status

from app.access import accounts
from app.access.oauth_flow import finish_oauth, start_oauth, take_state
from app.access.rate_limit import check_rate_limit
from app.access.schemas import (
    AccountOut,
    AuthConfigOut,
    EmailIn,
    LoginIn,
    OAuthCallbackIn,
    OAuthResultOut,
    OAuthStartIn,
    OAuthStartOut,
    PasswordResetIn,
    RegisterIn,
    SessionOut,
    TokenIn,
)
from app.access.sessions import create_session, revoke_session
from app.config import Settings
from app.dependencies import CurrentAccountDep, OAuthDep, SessionDep, SettingsDep, client_ip

router = APIRouter(prefix="/auth", tags=["auth"])


async def limit_auth_requests(request: Request, session: SessionDep, settings: SettingsDep):
    action = request.url.path.rsplit("/", 1)[-1]
    await check_rate_limit(
        session, f"auth:{action}:{client_ip(request)}", settings.auth_rate_per_minute
    )


RateLimited = [Depends(limit_auth_requests)]


def set_session_cookie(response: Response, settings: Settings, token: str) -> None:
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


async def start_session(
    session: SessionDep, settings: Settings, response: Response, user
) -> SessionOut:
    token, csrf_token = await create_session(session, user.id, settings.session_days)
    await session.commit()
    set_session_cookie(response, settings, token)
    return SessionOut(account=AccountOut.model_validate(user), csrf_token=csrf_token)


Provider = Literal["yandex", "vk"]


def set_oauth_cookie(response: Response, settings: Settings, state: str) -> None:
    response.set_cookie(
        settings.oauth_cookie_name,
        state,
        max_age=settings.oauth_state_minutes * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/api",
    )


@router.get("/config")
async def read_config(settings: SettingsDep, oauth: OAuthDep) -> AuthConfigOut:
    return AuthConfigOut(
        terms_url=settings.terms_url,
        terms_version=settings.terms_version,
        personal_data_url=settings.personal_data_url,
        personal_data_version=settings.personal_data_version,
        providers=oauth.enabled_providers(),
    )


@router.post("/register", status_code=status.HTTP_202_ACCEPTED, dependencies=RateLimited)
async def register(
    data: RegisterIn, request: Request, session: SessionDep, settings: SettingsDep
) -> None:
    await accounts.register(session, settings, data, client_ip(request))


@router.post("/confirm", dependencies=RateLimited)
async def confirm(
    data: TokenIn, session: SessionDep, settings: SettingsDep, response: Response
) -> SessionOut:
    user = await accounts.confirm_email(session, data.token)
    return await start_session(session, settings, response, user)


@router.post("/resend-confirmation", status_code=status.HTTP_202_ACCEPTED, dependencies=RateLimited)
async def resend_confirmation(data: EmailIn, session: SessionDep, settings: SettingsDep) -> None:
    await accounts.resend_confirmation(session, settings, data.email)


@router.post(
    "/password-reset/request", status_code=status.HTTP_202_ACCEPTED, dependencies=RateLimited
)
async def request_password_reset(data: EmailIn, session: SessionDep, settings: SettingsDep) -> None:
    await accounts.request_password_reset(session, settings, data.email)


@router.post(
    "/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT, dependencies=RateLimited
)
async def reset_password(data: PasswordResetIn, session: SessionDep) -> None:
    await accounts.reset_password(session, data.token, data.password)


@router.post("/login", dependencies=RateLimited)
async def login(
    data: LoginIn, session: SessionDep, settings: SettingsDep, response: Response
) -> SessionOut:
    user = await accounts.login(session, settings, data.email, data.password)
    return await start_session(session, settings, response, user)


@router.get("/session")
async def read_session(current: CurrentAccountDep) -> SessionOut:
    return SessionOut(
        account=AccountOut.model_validate(current.user), csrf_token=current.session.csrf_token
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    current: CurrentAccountDep, session: SessionDep, settings: SettingsDep, response: Response
) -> None:
    await revoke_session(session, current.token)
    await session.commit()
    response.delete_cookie(settings.session_cookie_name, path="/")


@router.post("/oauth/{provider}/start", dependencies=RateLimited)
async def start_provider_login(
    provider: Provider,
    data: OAuthStartIn,
    session: SessionDep,
    settings: SettingsDep,
    oauth: OAuthDep,
    response: Response,
) -> OAuthStartOut:
    consents = None
    if data.accept_terms and data.accept_personal_data:
        consents = (data.terms_version or "", data.personal_data_version or "")
    state, url = await start_oauth(session, settings, oauth, provider, consents=consents)
    set_oauth_cookie(response, settings, state)
    return OAuthStartOut(authorize_url=url)


@router.post("/oauth/{provider}/callback", dependencies=RateLimited)
async def finish_provider_login(
    provider: Provider,
    data: OAuthCallbackIn,
    request: Request,
    session: SessionDep,
    settings: SettingsDep,
    oauth: OAuthDep,
    response: Response,
) -> OAuthResultOut:
    cookie_state = request.cookies.get(settings.oauth_cookie_name)
    response.delete_cookie(settings.oauth_cookie_name, path="/api")
    state = await take_state(session, provider, data.state, cookie_state)
    outcome = await finish_oauth(
        session, settings, oauth, state, data.code, data.device_id, client_ip(request)
    )
    if outcome.kind == "linked":
        return OAuthResultOut(result="linked")
    started = await start_session(session, settings, response, outcome.user)
    return OAuthResultOut(result="session", session=started)
