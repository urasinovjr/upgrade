from app.analysis.contract import DraftProvider
from app.analysis.openai_provider import OpenAiDraftProvider
from app.analysis.sim_provider import SimDraftProvider
from app.analysis.variants import Variant
from app.config import Settings


class ProviderNotConfigured(Exception):
    pass


def make_provider(variant: Variant, settings: Settings) -> DraftProvider:
    if variant.kind == "sim":
        return SimDraftProvider(settings.provider_url, settings.analysis_timeout)
    api_key = settings.analysis_api_key.get_secret_value()
    if not api_key:
        raise ProviderNotConfigured(f"ANALYSIS_API_KEY is required for {variant.name}")
    if "{folder}" in variant.model_uri and not settings.analysis_folder_id:
        raise ProviderNotConfigured(f"ANALYSIS_FOLDER_ID is required for {variant.name}")
    return OpenAiDraftProvider(
        variant, api_key, settings.analysis_folder_id, settings.analysis_timeout
    )
