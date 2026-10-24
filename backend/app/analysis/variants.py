import subprocess
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

from app.analysis.sim_provider import MODEL, PROMPT_VERSION, PROVIDER_NAME
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
    base_url: str = ""
    model_uri: str = ""
    auth_scheme: str = "Bearer"
    project_header: str = ""
    temperature: float = 0.0
    max_tokens: int = 8000
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
        Variant(
            name="yandex-qwen36-v1",
            kind="openai",
            provider="yandex-ai-studio",
            model="qwen3.6-35b-a3b",
            prompt_version="math-1",
            base_url="https://ai.api.cloud.yandex.net/v1",
            model_uri="gpt://{folder}/qwen3.6-35b-a3b",
            auth_scheme="Api-Key",
            project_header="OpenAI-Project",
            price_input_per_mtok=Decimal(200),
            price_output_per_mtok=Decimal(300),
        ),
        Variant(
            name="yandex-qwen36-v2",
            kind="openai",
            provider="yandex-ai-studio",
            model="qwen3.6-35b-a3b",
            prompt_version="math-2",
            base_url="https://ai.api.cloud.yandex.net/v1",
            model_uri="gpt://{folder}/qwen3.6-35b-a3b",
            auth_scheme="Api-Key",
            project_header="OpenAI-Project",
            price_input_per_mtok=Decimal(200),
            price_output_per_mtok=Decimal(300),
        ),
    ]
}


def get_variant(name: str) -> Variant:
    if name not in VARIANTS:
        raise UnknownVariant(name)
    return VARIANTS[name]


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
