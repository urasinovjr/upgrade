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
from app.events import ProductEvent
from app.homework.models import Assignment, Homework, HomeworkFile, HomeworkJob, StudentAccess
from app.knowledge.models import Closure
from app.queue.models import Job
from app.stand.models import StandResult, StandWork
from app.students.models import Student
from app.timing.models import ActiveInterval, ManualSession, PilotParticipant
from app.works.models import AnalysisRun, Work, WorkFile, WorkRevision

__all__ = [
    "ActiveInterval",
    "AnalysisRun",
    "Assignment",
    "AuthSession",
    "Base",
    "Closure",
    "Consent",
    "EmailToken",
    "Homework",
    "HomeworkFile",
    "HomeworkJob",
    "Job",
    "ManualSession",
    "OAuthIdentity",
    "OAuthState",
    "PilotParticipant",
    "Plan",
    "ProductEvent",
    "RateLimit",
    "StandResult",
    "StandWork",
    "Student",
    "StudentAccess",
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
