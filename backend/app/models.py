from sqlalchemy.orm import configure_mappers

from app.access.models import (
    AuthSession,
    Consent,
    EmailToken,
    OAuthIdentity,
    OAuthState,
    RateLimit,
    User,
    UserPreference,
)
from app.billing.models import Plan, Subscription
from app.database import Base
from app.knowledge.models import Closure
from app.queue.models import Job
from app.stand.models import StandResult, StandWork
from app.students.models import Student
from app.works.models import Work, WorkFile, WorkRevision

__all__ = [
    "AuthSession",
    "Base",
    "Closure",
    "Consent",
    "EmailToken",
    "Job",
    "OAuthIdentity",
    "OAuthState",
    "Plan",
    "RateLimit",
    "StandResult",
    "StandWork",
    "Student",
    "Subscription",
    "User",
    "UserPreference",
    "Work",
    "WorkFile",
    "WorkRevision",
    "configure_models",
]


def configure_models() -> list[str]:
    configure_mappers()
    return [table.name for table in Base.metadata.sorted_tables]
