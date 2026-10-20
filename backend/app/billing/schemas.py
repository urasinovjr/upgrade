from datetime import datetime

from app.api_model import ApiModel


class SubscriptionOut(ApiModel):
    status: str
    kind: str | None
    ends_at: datetime | None
    plan_title: str | None
    contact_url: str
    checkout_available: bool


class PlanOut(ApiModel):
    code: str
    title: str
    price_minor: int
    currency: str
    period_days: int
