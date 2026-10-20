from fastapi import APIRouter, Depends, Request, Response, status

from app.access import accounts
from app.access.rate_limit import check_rate_limit
from app.access.schemas import (
    AccountOut,
    AuthConfigOut,
    EmailIn,
    LoginIn,
    PasswordResetIn,
    RegisterIn,
    SessionOut,
    TokenIn,
)
from app.access.sessions import create_session, revoke_session
from app.config import Settings
from app.dependencies import CurrentAccountDep, SessionDep, SettingsDep, client_ip

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


@router.get("/config")
async def read_config(settings: SettingsDep) -> AuthConfigOut:
    return AuthConfigOut(
        terms_url=settings.terms_url,
        terms_version=settings.terms_version,
        personal_data_url=settings.personal_data_url,
        personal_data_version=settings.personal_data_version,
        providers=[],
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
