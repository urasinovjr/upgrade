from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.billing.models import Plan, Subscription
from app.billing.rules import (
    Period,
    SubscriptionState,
    extension_start,
    subscription_state,
    trial_period,
)
from app.billing.schemas import SubscriptionOut
from app.config import Settings
from app.errors import DomainError


async def start_trial(session: AsyncSession, user_id: UUID, days: int) -> None:
    period = trial_period(datetime.now(UTC), days)
    await session.execute(
        insert(Subscription)
        .values(
            user_id=user_id,
            kind="trial",
            starts_at=period.starts_at,
            ends_at=period.ends_at,
            note="",
        )
        .on_conflict_do_nothing(index_elements=["user_id"], index_where=text("kind = 'trial'"))
    )


async def load_periods(session: AsyncSession, user_id: UUID) -> list[Period]:
    rows = await session.scalars(select(Subscription).where(Subscription.user_id == user_id))
    return [Period(row.kind, row.starts_at, row.ends_at) for row in rows]


async def current_state(session: AsyncSession, user_id: UUID) -> SubscriptionState:
    return subscription_state(await load_periods(session, user_id), datetime.now(UTC))


async def plan_title(session: AsyncSession, user_id: UUID) -> str | None:
    now = datetime.now(UTC)
    return await session.scalar(
        select(Plan.title)
        .join(Subscription, Subscription.plan_id == Plan.id)
        .where(Subscription.user_id == user_id, Subscription.ends_at > now)
        .order_by(Subscription.ends_at.desc())
        .limit(1)
    )


async def grant_subscription(
    session: AsyncSession, user_id: UUID, plan_code: str, days: int | None, note: str
) -> Subscription:
    plan = await session.scalar(select(Plan).where(Plan.code == plan_code))
    if plan is None:
        raise DomainError("plan_not_found")
    starts_at = extension_start(await load_periods(session, user_id), datetime.now(UTC))
    subscription = Subscription(
        user_id=user_id,
        plan_id=plan.id,
        kind="granted",
        starts_at=starts_at,
        ends_at=starts_at + timedelta(days=days or plan.period_days),
        note=note,
    )
    session.add(subscription)
    return subscription


async def upsert_plan(
    session: AsyncSession,
    code: str,
    title: str,
    price_minor: int,
    currency: str,
    period_days: int,
    is_active: bool,
) -> None:
    values = {
        "title": title,
        "price_minor": price_minor,
        "currency": currency.upper(),
        "period_days": period_days,
        "is_active": is_active,
    }
    await session.execute(
        insert(Plan)
        .values(code=code, **values)
        .on_conflict_do_update(index_elements=["code"], set_=values)
    )


async def active_plans(session: AsyncSession) -> list[Plan]:
    rows = await session.scalars(
        select(Plan).where(Plan.is_active).order_by(Plan.price_minor, Plan.code)
    )
    return list(rows)


async def describe_subscription(
    session: AsyncSession, settings: Settings, user_id: UUID
) -> SubscriptionOut:
    state = await current_state(session, user_id)
    return SubscriptionOut(
        status=state.status,
        kind=state.kind,
        ends_at=state.ends_at,
        plan_title=await plan_title(session, user_id),
        contact_url=settings.billing_contact_url,
        checkout_available=False,
    )
