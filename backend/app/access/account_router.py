from fastapi import APIRouter, Response, status
from sqlalchemy import select

from app.access.models import OAuthIdentity
from app.access.oauth_flow import start_oauth, unlink_identity
from app.access.router import Provider, set_oauth_cookie
from app.access.schemas import AccountDetailsOut, IdentityOut, OAuthStartOut
from app.dependencies import CurrentAccountDep, OAuthDep, SessionDep, SettingsDep

router = APIRouter(prefix="/account", tags=["account"])


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
