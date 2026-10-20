from datetime import UTC, datetime, timedelta
from uuid import uuid4

from httpx import AsyncClient
from sqlalchemy import update

from app.billing import Subscription


def student_data(**changes) -> dict:
    data = {"name": "Мария", "grade": 10, "goal": "Подготовка к ЕГЭ", "color": "teal"}
    return {**data, **changes}


async def create_student(client: AsyncClient, **changes) -> str:
    student_id = str(uuid4())
    response = await client.put(f"/api/students/{student_id}", json=student_data(**changes))
    assert response.status_code == 200
    return student_id


async def end_all_subscriptions(sessions) -> None:
    yesterday = datetime.now(UTC) - timedelta(days=1)
    async with sessions() as session:
        await session.execute(
            update(Subscription).values(starts_at=yesterday - timedelta(days=14), ends_at=yesterday)
        )
        await session.commit()
