from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.provider import Provider

if TYPE_CHECKING:
    from app.analysis.contract import DraftProvider
    from app.analysis.variants import Variant
    from app.files.storage import Storage
    from app.mail.mailer import Mailer


@dataclass
class WorkerContext:
    sessions: async_sessionmaker[AsyncSession]
    provider: Provider
    settings: Settings
    storage: Storage
    mailer: Mailer
    analysis_provider: DraftProvider
    analysis_variant: Variant
    code_commit: str
