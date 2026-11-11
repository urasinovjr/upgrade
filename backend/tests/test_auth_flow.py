from app.config import Settings
from tests.accounts import PASSWORD, mailed_jobs, mailed_token, registration, sign_up
from tests.conftest import FakeProvider, make_client

EMAIL = "teacher@example.com"


async def login(client, email: str = EMAIL, password: str = PASSWORD):
    return await client.post("/api/auth/login", json={"email": email, "password": password})


async def test_config_lists_documents(client):
    response = await client.get("/api/auth/config")

    assert response.status_code == 200
    assert response.json()["termsVersion"] == "2026-11-11"


async def test_unconfirmed_account_cannot_log_in(client):
    await client.post("/api/auth/register", json=registration(EMAIL))

    response = await login(client)

    assert response.status_code == 403
    assert response.json() == {"detail": "email_not_confirmed"}


async def test_confirmation_starts_session(client, sessions):
    await client.post("/api/auth/register", json=registration(EMAIL))
    token = await mailed_token(sessions, EMAIL, "confirm")

    confirmed = await client.post("/api/auth/confirm", json={"token": token})
    current = await client.get("/api/auth/session")
    reused = await client.post("/api/auth/confirm", json={"token": token})

    assert confirmed.status_code == 200
    assert "upgrade_session" in confirmed.cookies
    assert current.json()["account"]["email"] == EMAIL
    assert current.json()["csrfToken"] == confirmed.json()["csrfToken"]
    assert reused.json() == {"detail": "token_invalid"}


async def test_registration_needs_current_consents(client, sessions):
    missing = await client.post(
        "/api/auth/register", json=registration(EMAIL, acceptPersonalData=False)
    )
    outdated = await client.post(
        "/api/auth/register", json=registration(EMAIL, termsVersion="2020-01-01")
    )

    assert missing.json() == {"detail": "consent_required"}
    assert outdated.json() == {"detail": "consent_required"}
    assert await mailed_jobs(sessions, EMAIL, "confirm") == []


async def test_weak_password_is_rejected(client):
    response = await client.post("/api/auth/register", json=registration(EMAIL, "12345678"))

    assert response.status_code == 422
    assert response.json() == {"detail": "password_too_weak"}


async def test_registering_existing_email_keeps_password(client, sessions):
    await sign_up(client, sessions, EMAIL)

    again = await client.post(
        "/api/auth/register", json=registration(EMAIL.upper(), "another secret 7")
    )

    assert again.status_code == 202
    assert len(await mailed_jobs(sessions, EMAIL, "account_exists")) == 1
    assert (await login(client, " Teacher@Example.com ")).status_code == 200
    assert (await login(client, password="another secret 7")).status_code == 401


async def test_repeated_failures_lock_account(client, sessions):
    await sign_up(client, sessions, EMAIL)

    failures = [await login(client, password="wrong password 1") for _ in range(5)]
    locked = await login(client)

    assert {response.status_code for response in failures} == {401}
    assert locked.status_code == 423
    assert locked.json() == {"detail": "account_locked"}


async def test_password_reset_revokes_sessions(client, sessions):
    await sign_up(client, sessions, EMAIL)
    await client.post("/api/auth/password-reset/request", json={"email": EMAIL})
    token = await mailed_token(sessions, EMAIL, "reset")

    reset = await client.post(
        "/api/auth/password-reset/confirm", json={"token": token, "password": "new secret 99"}
    )

    assert reset.status_code == 204
    assert (await client.get("/api/auth/session")).status_code == 401
    assert (await login(client)).status_code == 401
    assert (await login(client, password="new secret 99")).status_code == 200


async def test_reset_for_unknown_email_sends_nothing(client, sessions):
    response = await client.post(
        "/api/auth/password-reset/request", json={"email": "nobody@example.com"}
    )

    assert response.status_code == 202
    assert await mailed_jobs(sessions, "nobody@example.com", "reset") == []


async def test_logout_needs_csrf_token(client, sessions):
    await sign_up(client, sessions, EMAIL)
    csrf_token = client.headers.pop("X-CSRF-Token")

    rejected = await client.post("/api/auth/logout")
    accepted = await client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf_token})

    assert rejected.json() == {"detail": "csrf_failed"}
    assert accepted.status_code == 204
    assert (await client.get("/api/auth/session")).status_code == 401


async def test_foreign_origin_is_rejected(client):
    response = await client.post(
        "/api/auth/register",
        json=registration(EMAIL),
        headers={"Origin": "https://evil.example"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "origin_forbidden"}


async def test_session_without_cookie_is_unauthenticated(client):
    response = await client.get("/api/auth/session")

    assert response.status_code == 401
    assert response.json() == {"detail": "not_authenticated"}


async def test_login_is_rate_limited(sessions, test_settings: Settings):
    settings = test_settings.model_copy(update={"auth_rate_per_minute": 2})
    async for client in make_client(settings, FakeProvider()):
        responses = [await login(client) for _ in range(3)]

    assert [response.status_code for response in responses] == [401, 401, 429]
