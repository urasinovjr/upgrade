from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import CurrentAccount, check_origin, load_current_account
from app.config import Settings
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


SessionDep = Annotated[AsyncSession, Depends(get_session)]
ProviderDep = Annotated[Provider, Depends(get_provider)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
StorageDep = Annotated[Storage, Depends(get_storage)]


def verify_origin(request: Request, settings: SettingsDep) -> None:
    check_origin(request, settings)


async def get_current_account(
    request: Request, session: SessionDep, settings: SettingsDep
) -> CurrentAccount:
    return await load_current_account(request, session, settings)


CurrentAccountDep = Annotated[CurrentAccount, Depends(get_current_account)]


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"
