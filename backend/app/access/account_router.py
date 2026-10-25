from typing import Annotated, Literal

from fastapi import APIRouter, Body, Response, status
from sqlalchemy import select

from app.access.deletion import delete_account
from app.access.models import OAuthIdentity
from app.access.oauth_flow import start_oauth, unlink_identity
from app.access.preferences import read_preference, save_preference
from app.access.router import Provider, set_oauth_cookie
from app.access.schemas import AccountDeleteIn, AccountDetailsOut, IdentityOut, OAuthStartOut
from app.dependencies import CurrentAccountDep, OAuthDep, SessionDep, SettingsDep

router = APIRouter(prefix="/account", tags=["account"])

PreferenceKey = Literal["dashboard-layout", "onboarding"]


@router.get("")
async def read_account(current: CurrentAccountDep, session: SessionDep) -> AccountDetailsOut:
    user = current.user
    identities = await session.scalars(
        select(OAuthIdentity)
        .where(OAuthIdentity.user_id == user.id)
        .order_by(OAuthIdentity.created_at)
    )
    return AccountDetailsOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        has_password=user.password_hash is not None,
        identities=[IdentityOut.model_validate(identity) for identity in identities],
    )


@router.post("/identities/{provider}/start")
async def start_provider_link(
    provider: Provider,
    current: CurrentAccountDep,
    session: SessionDep,
    settings: SettingsDep,
    oauth: OAuthDep,
    response: Response,
) -> OAuthStartOut:
    state, url = await start_oauth(session, settings, oauth, provider, user_id=current.user.id)
    set_oauth_cookie(response, settings, state)
    return OAuthStartOut(authorize_url=url)


@router.delete("/identities/{provider}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_provider(provider: Provider, current: CurrentAccountDep, session: SessionDep):
    await unlink_identity(session, current.user, provider)


@router.get("/preferences/{key}")
async def read_account_preference(
    key: PreferenceKey, current: CurrentAccountDep, session: SessionDep
) -> dict | None:
    return await read_preference(session, current.user.id, key)


@router.put("/preferences/{key}", status_code=status.HTTP_204_NO_CONTENT)
async def save_account_preference(
    key: PreferenceKey,
    value: Annotated[dict, Body()],
    current: CurrentAccountDep,
    session: SessionDep,
) -> None:
    await save_preference(session, current.user.id, key, value)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def remove_account(
    data: AccountDeleteIn,
    current: CurrentAccountDep,
    session: SessionDep,
    settings: SettingsDep,
    response: Response,
) -> None:
    await delete_account(session, settings, current.user, data.password)
    response.delete_cookie(settings.session_cookie_name, path="/")
