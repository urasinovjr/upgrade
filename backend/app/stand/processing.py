import asyncio

from app.provider import Provider, ProviderError
from app.queue import retry_delay


async def run_pipeline(provider: Provider, upload_id: str, pages: int) -> tuple[str, dict]:
    text = await provider.recognize(upload_id, pages)
    analysis = await provider.analyze(upload_id, text)
    return text, analysis


async def run_with_retries(
    provider: Provider, upload_id: str, pages: int, attempts: int, base_delay: float
) -> tuple[str, dict]:
    for attempt in range(1, attempts):
        try:
            return await run_pipeline(provider, upload_id, pages)
        except ProviderError:
            await asyncio.sleep(retry_delay(attempt, base_delay))
    return await run_pipeline(provider, upload_id, pages)
