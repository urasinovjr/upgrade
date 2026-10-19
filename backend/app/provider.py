import httpx


class ProviderError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class Provider:
    def __init__(self, base_url: str, timeout: float):
        self.client = httpx.AsyncClient(
            base_url=base_url,
            timeout=timeout,
            trust_env=False,
            limits=httpx.Limits(max_connections=500, max_keepalive_connections=100),
        )

    async def recognize(self, upload_id: str, pages: int) -> str:
        data = await self.post("/ocr", {"upload_id": upload_id, "pages": pages})
        return data["text"]

    async def analyze(self, upload_id: str, text: str) -> dict:
        return await self.post("/analyze", {"upload_id": upload_id, "text": text})

    async def post(self, path: str, payload: dict) -> dict:
        try:
            response = await self.client.post(path, json=payload)
        except httpx.TimeoutException as error:
            raise ProviderError("provider_timeout") from error
        except httpx.HTTPError as error:
            raise ProviderError("provider_unavailable") from error
        if response.status_code == 429:
            raise ProviderError("provider_rate_limited")
        if response.status_code >= 400:
            raise ProviderError("provider_unavailable")
        return response.json()

    async def close(self) -> None:
        await self.client.aclose()
