from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update

from app.billing import Subscription
from app.cli import run
from tests.accounts import mailed_token, registration, sign_up

EMAIL = "teacher@example.com"


async def expire_subscriptions(sessions) -> None:
    past = datetime.now(UTC) - timedelta(days=1)
    async with sessions() as session:
        await session.execute(
            update(Subscription).values(starts_at=past - timedelta(days=14), ends_at=past)
        )
        await session.commit()


async def test_confirmation_starts_fourteen_day_trial(client, sessions):
    body = await sign_up(client, sessions, EMAIL)

    subscription = body["subscription"]
    ends_at = datetime.fromisoformat(subscription["endsAt"])
    assert subscription["status"] == "trial"
    assert subscription["checkoutAvailable"] is False
    assert timedelta(days=13) < ends_at - datetime.now(UTC) <= timedelta(days=14)


async def test_trial_is_given_once(client, sessions):
    await sign_up(client, sessions, EMAIL)
    await client.post("/api/auth/password-reset/request", json={"email": EMAIL})
    token = await mailed_token(sessions, EMAIL, "reset")
    await client.post(
        "/api/auth/password-reset/confirm", json={"token": token, "password": "new secret 99"}
    )

    async with sessions() as session:
        trials = list(await session.scalars(select(Subscription)))
    assert len(trials) == 1


async def test_reset_before_confirmation_starts_trial(client, sessions):
    await client.post("/api/auth/register", json=registration(EMAIL))
    await client.post("/api/auth/password-reset/request", json={"email": EMAIL})
    token = await mailed_token(sessions, EMAIL, "reset")
    await client.post(
        "/api/auth/password-reset/confirm", json={"token": token, "password": "new secret 99"}
    )

    login = await client.post("/api/auth/login", json={"email": EMAIL, "password": "new secret 99"})

    assert login.json()["subscription"]["status"] == "trial"


async def test_expired_trial_is_reported(client, sessions):
    await sign_up(client, sessions, EMAIL)
    await expire_subscriptions(sessions)

    response = await client.get("/api/subscription")

    assert response.json()["status"] == "expired"


async def test_cli_grants_subscription_after_expiry(client, sessions, test_settings):
    await sign_up(client, sessions, EMAIL)
    await expire_subscriptions(sessions)

    saved = await run(
        ["plan-upsert", "--code", "teacher", "--title", "Репетитор", "--price-minor", "99000"],
        test_settings,
    )
    granted = await run(
        ["grant-subscription", "--email", EMAIL, "--plan", "teacher", "--note", "pilot"],
        test_settings,
    )
    subscription = (await client.get("/api/subscription")).json()
    plans = (await client.get("/api/plans")).json()

    assert saved == "plan teacher saved"
    assert granted.startswith(f"subscription for {EMAIL} ends ")
    assert subscription["status"] == "active"
    assert subscription["planTitle"] == "Репетитор"
    ends_at = datetime.fromisoformat(subscription["endsAt"])
    assert timedelta(days=29) < ends_at - datetime.now(UTC) <= timedelta(days=30)
    assert plans == [
        {
            "code": "teacher",
            "title": "Репетитор",
            "priceMinor": 99000,
            "currency": "RUB",
            "periodDays": 30,
        }
    ]


async def test_grant_during_trial_extends_after_trial(client, sessions, test_settings):
    body = await sign_up(client, sessions, EMAIL)
    trial_end = datetime.fromisoformat(body["subscription"]["endsAt"])
    await run(
        ["plan-upsert", "--code", "teacher", "--title", "Репетитор", "--price-minor", "0"],
        test_settings,
    )

    await run(
        ["grant-subscription", "--email", EMAIL, "--plan", "teacher", "--days", "10"],
        test_settings,
    )
    subscription = (await client.get("/api/subscription")).json()

    assert subscription["status"] == "trial"
    assert subscription["planTitle"] == "Репетитор"
    assert datetime.fromisoformat(subscription["endsAt"]) == trial_end + timedelta(days=10)
