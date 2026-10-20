from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from app.access.oauth_client import HttpOAuthClient, OAuthError
from app.config import Settings

SETTINGS = Settings(yandex_client_id="ya-app", vk_client_id="vk-app")


def form(request: httpx.Request) -> dict[str, str]:
    return {key: values[0] for key, values in parse_qs(request.content.decode()).items()}


def recording_client(routes: dict[str, httpx.Response], seen: list[httpx.Request]):
    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return routes[f"{request.method} {request.url.copy_with(query=None)}"]

    return HttpOAuthClient(SETTINGS, httpx.MockTransport(handle))


def test_only_configured_providers_are_enabled():
    assert HttpOAuthClient(Settings(vk_client_id="vk-app")).enabled_providers() == ["vk"]


def test_authorize_url_uses_pkce():
    url = HttpOAuthClient(SETTINGS).authorize_url("vk", "state-1", "verifier", "https://u/cb")
    query = parse_qs(urlparse(url).query)

    assert url.startswith("https://id.vk.ru/authorize?")
    assert query["code_challenge_method"] == ["S256"]
    assert query["scope"] == ["email"]
    assert query["redirect_uri"] == ["https://u/cb"]


async def test_yandex_profile_is_read_with_oauth_header():
    seen: list[httpx.Request] = []
    client = recording_client(
        {
            "POST https://oauth.yandex.ru/token": httpx.Response(
                200, json={"access_token": "ya-token"}
            ),
            "GET https://login.yandex.ru/info": httpx.Response(
                200, json={"id": "42", "default_email": "a@yandex.ru", "real_name": "Анна"}
            ),
        },
        seen,
    )

    profile = await client.fetch_profile("yandex", "code", "verifier", "https://u/cb", None)

    assert form(seen[0])["code_verifier"] == "verifier"
    assert "client_secret" not in form(seen[0])
    assert seen[1].headers["Authorization"] == "OAuth ya-token"
    assert (profile.subject, profile.email, profile.display_name) == ("42", "a@yandex.ru", "Анна")


async def test_vk_profile_sends_device_id():
    seen: list[httpx.Request] = []
    client = recording_client(
        {
            "POST https://id.vk.ru/oauth2/auth": httpx.Response(
                200, json={"access_token": "vk-token"}
            ),
            "POST https://id.vk.ru/oauth2/user_info": httpx.Response(
                200, json={"user": {"user_id": 7, "first_name": "Анна", "last_name": "Петрова"}}
            ),
        },
        seen,
    )

    profile = await client.fetch_profile("vk", "code", "verifier", "https://u/cb", "dev-1")

    assert form(seen[0])["device_id"] == "dev-1"
    assert form(seen[1])["access_token"] == "vk-token"
    assert (profile.subject, profile.email, profile.display_name) == ("7", None, "Анна Петрова")


async def test_provider_error_becomes_oauth_error():
    client = recording_client(
        {"POST https://oauth.yandex.ru/token": httpx.Response(400, json={"error": "bad"})}, []
    )

    with pytest.raises(OAuthError):
        await client.fetch_profile("yandex", "code", "verifier", "https://u/cb", None)
