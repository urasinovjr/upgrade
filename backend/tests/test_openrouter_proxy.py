import asyncio
import json

import httpx
import pytest
from pydantic import ValidationError

from app.analysis.openai_provider import OpenAiDraftProvider
from app.analysis.openrouter import check_budget
from app.analysis.providers import make_provider
from app.analysis.variants import get_variant
from app.config import Settings
from app.provider import ProviderError
from tests.test_openai_provider import RECOGNITION
from tests.test_openrouter import (
    CONDITIONS,
    KEY,
    MATERIAL,
    REVIEW_ANSWER,
    VARIANT,
    invoke,
    response,
)


@pytest.mark.parametrize(
    ("operation", "raw"),
    [
        ("recognition", RECOGNITION),
        ("review", REVIEW_ANSWER),
        ("conditions", CONDITIONS),
        ("material", MATERIAL),
    ],
)
async def test_proxy_is_shared_by_budget_and_all_operations(monkeypatch, operation, raw):
    requests = []
    clients = []
    create_client = httpx.AsyncClient

    def send(request):
        requests.append(request)
        if request.url.path.endswith("/key"):
            return httpx.Response(200, json={"data": KEY})
        return response(raw)

    def build_client(**options):
        clients.append(options.copy())
        options.pop("proxy")
        options["transport"] = httpx.MockTransport(send)
        return create_client(**options)

    monkeypatch.setattr(httpx, "AsyncClient", build_client)
    settings = Settings(
        openrouter_api_key="private-key",
        openrouter_privacy_confirmed=True,
        openrouter_proxy_url="http://openrouter-proxy:18080",
    )
    provider = make_provider(VARIANT, settings)
    try:
        reply = await invoke(provider, operation)
    finally:
        await provider.close()

    assert len(clients) == 1
    assert clients[0]["proxy"] == "http://openrouter-proxy:18080"
    assert clients[0]["trust_env"] is False
    assert clients[0]["verify"] is True
    assert [request.url.path for request in requests] == ["/api/v1/key", "/api/v1/chat/completions"]
    assert all(request.headers["Authorization"] == "Bearer private-key" for request in requests)
    assert reply.prompt_version == "math-3"
    assert json.loads(requests[1].content)["provider"]["zdr"] is True


@pytest.mark.parametrize("variant_name", ["openrouter-qwen38-v1", "yandex-qwen36-v3"])
async def test_proxy_setting_only_applies_to_openrouter(monkeypatch, variant_name):
    clients = []
    create_client = httpx.AsyncClient

    def build_client(**options):
        clients.append(options.copy())
        options.pop("proxy")
        return create_client(**options)

    monkeypatch.setattr(httpx, "AsyncClient", build_client)
    settings = Settings(
        openrouter_api_key="openrouter-secret",
        openrouter_privacy_confirmed=True,
        analysis_api_key="yandex-secret",
        analysis_folder_id="folder",
        openrouter_proxy_url="http://openrouter-proxy:18080",
    )
    provider = make_provider(get_variant(variant_name), settings)
    await provider.close()

    expected = "http://openrouter-proxy:18080" if variant_name.startswith("openrouter-") else None
    assert clients[0]["proxy"] == expected


async def test_proxy_is_optional(monkeypatch):
    monkeypatch.delenv("OPENROUTER_PROXY_URL", raising=False)
    settings = Settings(_env_file=None, openrouter_api_key="key", openrouter_privacy_confirmed=True)
    provider = make_provider(VARIANT, settings)
    try:
        assert settings.openrouter_proxy_url.get_secret_value() == ""
        assert provider.client.base_url == "https://openrouter.ai/api/v1/"
    finally:
        await provider.close()


async def test_proxy_rejection_stops_request_without_leaking_key_or_direct_fallback():
    connects = []
    received = asyncio.Event()

    async def reject(reader, writer):
        connects.append(await reader.readuntil(b"\r\n\r\n"))
        writer.write(b"HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n")
        await writer.drain()
        writer.close()
        await writer.wait_closed()
        received.set()

    server = await asyncio.start_server(reject, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    provider = OpenAiDraftProvider(
        VARIANT, "openrouter-private-key", "", 2, proxy_url=f"http://127.0.0.1:{port}"
    )
    try:
        with pytest.raises(ProviderError, match="provider_unavailable"):
            await check_budget(provider.client)
        await asyncio.wait_for(received.wait(), timeout=2)
    finally:
        await provider.close()
        server.close()
        await server.wait_closed()

    assert len(connects) == 1
    assert connects[0].startswith(b"CONNECT openrouter.ai:443 HTTP/1.1\r\n")
    assert b"openrouter-private-key" not in connects[0]
    assert b"Authorization:" not in connects[0]


@pytest.mark.parametrize(
    "value",
    [
        "socks5://proxy:9050",
        "http://",
        "http://proxy:0",
        "http://proxy:65536",
        "http://proxy:not-a-port",
        "http://private:secret@proxy/path",
        "https://proxy?token=secret",
        "http://proxy/#fragment",
        "http://proxy name:18080",
    ],
)
def test_invalid_proxy_configuration_is_rejected_without_disclosing_input(value):
    with pytest.raises(ValidationError) as caught:
        Settings(openrouter_proxy_url=value)

    assert "OPENROUTER_PROXY_URL" in str(caught.value)
    assert value not in str(caught.value)


def test_proxy_credentials_are_hidden():
    settings = Settings(openrouter_proxy_url="http://private:proxy-password@proxy:18080")

    assert "proxy-password" not in repr(settings)
    assert "proxy-password" not in settings.model_dump_json()
