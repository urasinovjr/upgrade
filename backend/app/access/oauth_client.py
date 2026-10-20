import base64
import hashlib
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urlencode

import httpx

from app.config import Settings

PROVIDERS = ("yandex", "vk")


class OAuthError(Exception):
    pass


@dataclass(frozen=True)
class OAuthProfile:
    subject: str
    email: str | None
    display_name: str


class OAuthClient(Protocol):
    def enabled_providers(self) -> list[str]: ...

    def authorize_url(self, provider: str, state: str, verifier: str, redirect: str) -> str: ...

    async def fetch_profile(
        self, provider: str, code: str, verifier: str, redirect: str, device_id: str | None
    ) -> OAuthProfile: ...


def code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def full_name(*parts: str | None) -> str:
    name = " ".join(part for part in parts if part).strip()
    return name[:100] or "Репетитор"


class HttpOAuthClient:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings
        self.transport = transport

    def enabled_providers(self) -> list[str]:
        enabled = []
        if self.settings.yandex_client_id:
            enabled.append("yandex")
        if self.settings.vk_client_id:
            enabled.append("vk")
        return enabled

    def authorize_url(self, provider: str, state: str, verifier: str, redirect: str) -> str:
        settings = self.settings
        if provider == "yandex":
            base, client_id, scope = (
                settings.yandex_authorize_url,
                settings.yandex_client_id,
                "login:info login:email",
            )
        else:
            base, client_id, scope = settings.vk_authorize_url, settings.vk_client_id, "email"
        query = {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect,
            "scope": scope,
            "state": state,
            "code_challenge": code_challenge(verifier),
            "code_challenge_method": "S256",
        }
        return f"{base}?{urlencode(query)}"

    async def fetch_profile(
        self, provider: str, code: str, verifier: str, redirect: str, device_id: str | None
    ) -> OAuthProfile:
        try:
            timeout = self.settings.oauth_timeout
            async with httpx.AsyncClient(timeout=timeout, transport=self.transport) as http:
                if provider == "yandex":
                    return await self.yandex_profile(http, code, verifier)
                return await self.vk_profile(http, code, verifier, redirect, device_id)
        except (httpx.HTTPError, KeyError, ValueError) as error:
            raise OAuthError(provider) from error

    async def yandex_profile(self, http: httpx.AsyncClient, code: str, verifier: str):
        settings = self.settings
        form = {
            "grant_type": "authorization_code",
            "code": code,
            "client_id": settings.yandex_client_id,
            "code_verifier": verifier,
        }
        if settings.yandex_client_secret.get_secret_value():
            form["client_secret"] = settings.yandex_client_secret.get_secret_value()
        token = await http.post(settings.yandex_token_url, data=form)
        token.raise_for_status()
        info = await http.get(
            settings.yandex_info_url,
            params={"format": "json"},
            headers={"Authorization": f"OAuth {token.json()['access_token']}"},
        )
        info.raise_for_status()
        data = info.json()
        return OAuthProfile(
            subject=str(data["id"]),
            email=data.get("default_email"),
            display_name=full_name(data.get("real_name") or data.get("display_name")),
        )

    async def vk_profile(
        self,
        http: httpx.AsyncClient,
        code: str,
        verifier: str,
        redirect: str,
        device_id: str | None,
    ):
        settings = self.settings
        token = await http.post(
            settings.vk_token_url,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "code_verifier": verifier,
                "client_id": settings.vk_client_id,
                "device_id": device_id or "",
                "redirect_uri": redirect,
            },
        )
        token.raise_for_status()
        info = await http.post(
            settings.vk_info_url,
            data={"client_id": settings.vk_client_id, "access_token": token.json()["access_token"]},
        )
        info.raise_for_status()
        user = info.json()["user"]
        return OAuthProfile(
            subject=str(user["user_id"]),
            email=user.get("email") or None,
            display_name=full_name(user.get("first_name"), user.get("last_name")),
        )
