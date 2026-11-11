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
    openrouter = variant.provider == "openrouter"
    secret = settings.openrouter_api_key if openrouter else settings.analysis_api_key
    api_key = secret.get_secret_value()
    if not api_key:
        name = "OPENROUTER_API_KEY" if openrouter else "ANALYSIS_API_KEY"
        raise ProviderNotConfigured(f"{name} is required for {variant.name}")
    if openrouter and not settings.openrouter_privacy_confirmed:
        raise ProviderNotConfigured("Confirm OpenRouter logging off, ZDR-only, no Safety Retention")
    if "{folder}" in variant.model_uri and not settings.analysis_folder_id:
        raise ProviderNotConfigured(f"ANALYSIS_FOLDER_ID is required for {variant.name}")
    return OpenAiDraftProvider(
        variant, api_key, settings.analysis_folder_id, settings.analysis_timeout
    )
