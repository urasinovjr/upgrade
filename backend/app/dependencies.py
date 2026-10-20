from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import CurrentAccount, check_origin, load_current_account
from app.access.oauth_client import OAuthClient
from app.billing import current_state
from app.config import Settings
from app.errors import DomainError
from app.files import Storage
from app.provider import Provider


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.sessions() as session:
        yield session


def get_provider(request: Request) -> Provider:
    return request.app.state.provider


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_storage(request: Request) -> Storage:
    return request.app.state.storage


def get_oauth(request: Request) -> OAuthClient:
    return request.app.state.oauth


SessionDep = Annotated[AsyncSession, Depends(get_session)]
ProviderDep = Annotated[Provider, Depends(get_provider)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
StorageDep = Annotated[Storage, Depends(get_storage)]
OAuthDep = Annotated[OAuthClient, Depends(get_oauth)]


def verify_origin(request: Request, settings: SettingsDep) -> None:
    check_origin(request, settings)


async def get_current_account(
    request: Request, session: SessionDep, settings: SettingsDep
) -> CurrentAccount:
    return await load_current_account(request, session, settings)


CurrentAccountDep = Annotated[CurrentAccount, Depends(get_current_account)]


async def get_writable_account(current: CurrentAccountDep, session: SessionDep) -> CurrentAccount:
    state = await current_state(session, current.user.id)
    if not state.active:
        raise DomainError("subscription_inactive")
    return current


WritableAccountDep = Annotated[CurrentAccount, Depends(get_writable_account)]


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"
