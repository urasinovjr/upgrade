from httpx import AsyncClient
from sqlalchemy import select

from app.queue import Job

PASSWORD = "correct horse 42"
TERMS_VERSION = "2026-11-11"


def registration(email: str, password: str = PASSWORD, **changes) -> dict:
    data = {
        "email": email,
        "password": password,
        "displayName": "Анна Петровна",
        "acceptTerms": True,
        "acceptPersonalData": True,
        "termsVersion": TERMS_VERSION,
        "personalDataVersion": TERMS_VERSION,
    }
    return {**data, **changes}


async def mailed_jobs(sessions, email: str, template: str) -> list[Job]:
    async with sessions() as session:
        jobs = await session.scalars(
            select(Job)
            .where(
                Job.kind == "send_email",
                Job.payload["to"].astext == email,
                Job.payload["template"].astext == template,
            )
            .order_by(Job.created_at)
        )
        return list(jobs)


async def mailed_token(sessions, email: str, template: str) -> str:
    jobs = await mailed_jobs(sessions, email, template)
    return jobs[-1].payload["token"]


async def sign_up(client: AsyncClient, sessions, email: str) -> dict:
    response = await client.post("/api/auth/register", json=registration(email))
    assert response.status_code == 202
    token = await mailed_token(sessions, email, "confirm")
    response = await client.post("/api/auth/confirm", json={"token": token})
    assert response.status_code == 200
    body = response.json()
    client.headers["X-CSRF-Token"] = body["csrfToken"]
    return body
