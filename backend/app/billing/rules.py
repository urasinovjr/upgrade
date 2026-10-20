from dataclasses import dataclass
from datetime import datetime, timedelta


@dataclass(frozen=True)
class Period:
    kind: str
    starts_at: datetime
    ends_at: datetime


@dataclass(frozen=True)
class SubscriptionState:
    status: str
    kind: str | None
    ends_at: datetime | None

    @property
    def active(self) -> bool:
        return self.status in ("trial", "active")


def subscription_state(periods: list[Period], now: datetime) -> SubscriptionState:
    if not periods:
        return SubscriptionState("none", None, None)
    current = [period for period in periods if period.starts_at <= now < period.ends_at]
    last_end = max(period.ends_at for period in periods)
    if not current:
        return SubscriptionState("expired", None, last_end)
    paid = [period for period in current if period.kind != "trial"]
    if paid:
        return SubscriptionState("active", paid[0].kind, last_end)
    return SubscriptionState("trial", "trial", last_end)


def extension_start(periods: list[Period], now: datetime) -> datetime:
    ends = [period.ends_at for period in periods if period.ends_at > now]
    return max([now, *ends])


def trial_period(now: datetime, days: int) -> Period:
    return Period("trial", now, now + timedelta(days=days))
