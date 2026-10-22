import subprocess
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

from app.analysis.contract import DraftProvider
from app.analysis.sim_provider import MODEL, PROMPT_VERSION, PROVIDER_NAME, SimDraftProvider
from app.config import Settings


class UnknownVariant(Exception):
    def __init__(self, name: str):
        super().__init__(name)
        self.name = name


@dataclass(frozen=True)
class Variant:
    name: str
    kind: Literal["sim", "openai"]
    provider: str
    model: str
    prompt_version: str
    price_input_per_mtok: Decimal = Decimal(0)
    price_output_per_mtok: Decimal = Decimal(0)
    currency: str = "RUB"


VARIANTS = {
    variant.name: variant
    for variant in [
        Variant(
            name="sim",
            kind="sim",
            provider=PROVIDER_NAME,
            model=MODEL,
            prompt_version=PROMPT_VERSION,
        ),
    ]
}


def get_variant(name: str) -> Variant:
    if name not in VARIANTS:
        raise UnknownVariant(name)
    return VARIANTS[name]


def make_provider(variant: Variant, settings: Settings) -> DraftProvider:
    return SimDraftProvider(settings.provider_url, settings.analysis_timeout)


def git(*args: str) -> str:
    finished = subprocess.run(["git", *args], capture_output=True, text=True, check=True, timeout=5)
    return finished.stdout.strip()


def code_commit(settings: Settings) -> str:
    if settings.app_commit:
        return settings.app_commit
    try:
        commit = git("rev-parse", "--short", "HEAD")
        changed = git("status", "--porcelain", "--untracked-files=no")
    except (OSError, subprocess.SubprocessError):
        return "unknown"
    return f"{commit}-dirty" if changed else commit
