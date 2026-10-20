from urllib.parse import parse_qs, urlparse

from sqlalchemy import select

from app.access import Consent, User
from app.access.oauth_client import OAuthProfile, code_challenge
from tests.accounts import TERMS_VERSION, sign_up

CONSENTS = {
    "acceptTerms": True,
    "acceptPersonalData": True,
    "termsVersion": TERMS_VERSION,
    "personalDataVersion": TERMS_VERSION,
}


async def start(client, provider: str = "yandex", consents: dict | None = None) -> str:
    response = await client.post(f"/api/auth/oauth/{provider}/start", json=consents or {})
    assert response.status_code == 200
    query = parse_qs(urlparse(response.json()["authorizeUrl"]).query)
    return query["state"][0]


async def callback(client, state: str, code: str, provider: str = "yandex", **extra):
    return await client.post(
        f"/api/auth/oauth/{provider}/callback", json={"code": code, "state": state, **extra}
    )


def profile(subject: str, email: str | None = "teacher@yandex.ru") -> OAuthProfile:
    return OAuthProfile(subject=subject, email=email, display_name="Анна Петровна")


async def users(sessions) -> list[User]:
    async with sessions() as session:
        return list(await session.scalars(select(User)))


def test_code_challenge_matches_rfc_example():
    verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

    assert code_challenge(verifier) == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"


async def test_config_lists_enabled_providers(oauth_client):
    response = await oauth_client.get("/api/auth/config")

    assert response.json()["providers"] == ["yandex", "vk"]


async def test_signup_with_consent_creates_confirmed_account(oauth_client, oauth, sessions):
    oauth.profiles["code-1"] = profile("ya-1")
    state = await start(oauth_client, consents=CONSENTS)

    response = await callback(oauth_client, state, "code-1")

    assert response.status_code == 200
    assert response.json()["result"] == "session"
    assert response.json()["session"]["account"]["email"] == "teacher@yandex.ru"
    stored = await users(sessions)
    assert stored[0].email_confirmed_at is not None
    assert stored[0].password_hash is None
    async with sessions() as session:
        kinds = set(await session.scalars(select(Consent.kind)))
    assert kinds == {"terms", "personal_data"}


async def test_signup_without_consent_is_refused(oauth_client, oauth, sessions):
    oauth.profiles["code-1"] = profile("ya-1")
    state = await start(oauth_client)

    response = await callback(oauth_client, state, "code-1")

    assert response.json() == {"detail": "oauth_signup_requires_consent"}
    assert await users(sessions) == []


async def test_known_identity_logs_in_without_consent(oauth_client, oauth):
    oauth.profiles["code-1"] = profile("ya-1")
    oauth.profiles["code-2"] = profile("ya-1")
    await callback(oauth_client, await start(oauth_client, consents=CONSENTS), "code-1")

    response = await callback(oauth_client, await start(oauth_client), "code-2")

    assert response.json()["result"] == "session"


async def test_matching_email_is_not_linked_automatically(oauth_client, oauth, sessions):
    await sign_up(oauth_client, sessions, "teacher@yandex.ru")
    oauth.profiles["code-1"] = profile("ya-1", "Teacher@Yandex.ru")
    state = await start(oauth_client, consents=CONSENTS)

    response = await callback(oauth_client, state, "code-1")

    assert response.status_code == 409
    assert response.json() == {"detail": "oauth_email_taken"}


async def test_vk_account_without_email_is_allowed(oauth_client, oauth):
    oauth.profiles["code-1"] = profile("vk-1", email=None)
    state = await start(oauth_client, "vk", CONSENTS)

    response = await callback(oauth_client, state, "code-1", "vk", deviceId="device-7")

    assert response.json()["session"]["account"]["email"] is None
    assert oauth.requests[-1][3] == "device-7"


async def test_state_is_single_use_and_bound_to_cookie(oauth_client, oauth):
    oauth.profiles["code-1"] = profile("ya-1")
    state = await start(oauth_client, consents=CONSENTS)

    oauth_client.cookies.delete("upgrade_oauth")
    without_cookie = await callback(oauth_client, state, "code-1")
    oauth_client.cookies.set("upgrade_oauth", state)
    first = await callback(oauth_client, state, "code-1")
    oauth_client.cookies.set("upgrade_oauth", state)
    replay = await callback(oauth_client, state, "code-1")

    assert without_cookie.json() == {"detail": "oauth_state_invalid"}
    assert first.status_code == 200
    assert replay.json() == {"detail": "oauth_state_invalid"}


async def test_state_is_bound_to_provider(oauth_client, oauth):
    oauth.profiles["code-1"] = profile("ya-1")
    state = await start(oauth_client, "yandex", CONSENTS)

    response = await callback(oauth_client, state, "code-1", "vk")

    assert response.json() == {"detail": "oauth_state_invalid"}


async def test_provider_failure_is_reported(oauth_client):
    state = await start(oauth_client, consents=CONSENTS)

    response = await callback(oauth_client, state, "unknown-code")

    assert response.status_code == 502
    assert response.json() == {"detail": "oauth_failed"}


async def test_link_and_unlink_provider(oauth_client, oauth, sessions):
    await sign_up(oauth_client, sessions, "teacher@example.com")
    oauth.profiles["code-1"] = profile("vk-1", "other@vk.com")
    started = await oauth_client.post("/api/account/identities/vk/start")
    state = parse_qs(urlparse(started.json()["authorizeUrl"]).query)["state"][0]

    linked = await callback(oauth_client, state, "code-1", "vk")
    account = await oauth_client.get("/api/account")
    unlinked = await oauth_client.delete("/api/account/identities/vk")

    assert linked.json() == {"result": "linked", "session": None}
    assert [item["provider"] for item in account.json()["identities"]] == ["vk"]
    assert account.json()["hasPassword"] is True
    assert unlinked.status_code == 204
    assert (await oauth_client.get("/api/account")).json()["identities"] == []


async def test_identity_of_other_account_cannot_be_linked(oauth_client, oauth, sessions):
    oauth.profiles["code-1"] = profile("ya-1", "first@yandex.ru")
    oauth.profiles["code-2"] = profile("ya-1", "first@yandex.ru")
    await callback(oauth_client, await start(oauth_client, consents=CONSENTS), "code-1")
    oauth_client.cookies.clear()
    await sign_up(oauth_client, sessions, "second@example.com")
    started = await oauth_client.post("/api/account/identities/yandex/start")
    state = parse_qs(urlparse(started.json()["authorizeUrl"]).query)["state"][0]

    response = await callback(oauth_client, state, "code-2")

    assert response.json() == {"detail": "oauth_identity_taken"}


async def test_last_login_method_cannot_be_removed(oauth_client, oauth):
    oauth.profiles["code-1"] = profile("ya-1")
    signed = await callback(oauth_client, await start(oauth_client, consents=CONSENTS), "code-1")
    oauth_client.headers["X-CSRF-Token"] = signed.json()["session"]["csrfToken"]

    response = await oauth_client.delete("/api/account/identities/yandex")

    assert response.status_code == 409
    assert response.json() == {"detail": "last_login_method"}


async def test_linking_needs_session(oauth_client):
    response = await oauth_client.post("/api/account/identities/vk/start")

    assert response.status_code == 401


async def test_provider_account_is_deleted_without_password(oauth_client, oauth, sessions):
    oauth.profiles["code-1"] = profile("ya-1")
    signed = await callback(oauth_client, await start(oauth_client, consents=CONSENTS), "code-1")
    oauth_client.headers["X-CSRF-Token"] = signed.json()["session"]["csrfToken"]

    response = await oauth_client.request("DELETE", "/api/account", json={})

    assert response.status_code == 204
    assert await users(sessions) == []
