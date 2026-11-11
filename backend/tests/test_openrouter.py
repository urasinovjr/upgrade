import json
from decimal import Decimal

import httpx
import pytest
from pydantic import SecretStr

from app.analysis.contract import ConditionImage
from app.analysis.openai_provider import OpenAiDraftProvider
from app.analysis.openrouter import ROUTING, check_budget
from app.analysis.pipeline import RunRecord
from app.analysis.providers import ProviderNotConfigured, make_provider
from app.analysis.variants import get_variant
from app.config import Settings
from app.provider import ProviderError
from tests.test_openai_provider import PAGES, RECOGNITION, REVIEW, REVIEW_TASKS, TASKS, completion

VARIANT = get_variant("openrouter-qwen38-v1")
REVIEW_ANSWER = {
    "tasks": [
        {key: value for key, value in REVIEW["tasks"][0].items() if key != "reasoning"}
        | {"task_type_id": "quadratic_eq"}
    ]
}
CONDITIONS = {
    "tasks": [
        {
            "title": "Уравнение",
            "condition": "Решите",
            "formula": "x^2=4",
            "topic_id": "equations",
            "task_type_id": "quadratic_eq",
            "file_ids": ["f0"],
            "exam": None,
        }
    ]
}
MATERIAL = {
    "explanation": "Проверьте оба корня",
    "exercises": [
        {"condition": f"x^2={n * n}", "answer": f"x=±{n}", "solution": f"(x-{n})(x+{n})=0"}
        for n in (2, 3, 4)
    ],
}
KEY = {"limit": 1, "usage": 0.01, "limit_remaining": 0.99, "limit_reset": None}


@pytest.fixture
async def routed_provider():
    providers = []

    def build(response, key=None):
        requests = []

        def send(request):
            requests.append(request)
            if request.url.path.endswith("/key"):
                return httpx.Response(200, json={"data": KEY if key is None else key})
            if isinstance(response, Exception):
                raise response
            return response

        provider = OpenAiDraftProvider(
            VARIANT, "private-key", "", 3, transport=httpx.MockTransport(send)
        )
        providers.append(provider)
        return provider, requests

    yield build
    for provider in providers:
        await provider.close()


def response(raw, **changes):
    data = completion(json.dumps(raw))
    data.update(id="gen-test", provider="Nebius", model="qwen/qwen3.8-27b", **changes)
    data["usage"].update(cost=0.0012345678, completion_tokens_details={"reasoning_tokens": 75})
    data["choices"][0]["message"]["reasoning"] = "private thoughts"
    return httpx.Response(200, json=data)


async def invoke(provider, operation):
    if operation == "recognition":
        return await provider.recognize(PAGES, TASKS)
    if operation == "review":
        return await provider.review(
            REVIEW_TASKS, [ConditionImage(task_id="t1", image=PAGES[0], kind="solution")]
        )
    if operation == "conditions":
        return await provider.recognize_conditions("Решите уравнение", PAGES)
    return await provider.generate_material("equations", "Потерян корень")


def check_schema(schema):
    if isinstance(schema, list):
        for item in schema:
            check_schema(item)
    elif isinstance(schema, dict):
        if schema.get("type") == "object":
            assert schema["additionalProperties"] is False
            assert set(schema["required"]) == set(schema["properties"])
        assert "$ref" not in schema and "$defs" not in schema and "default" not in schema
        for value in schema.values():
            check_schema(value)


@pytest.mark.parametrize(
    ("operation", "raw"),
    [
        ("recognition", RECOGNITION),
        ("review", REVIEW_ANSWER),
        ("conditions", CONDITIONS),
        ("material", MATERIAL),
    ],
)
async def test_four_operations_use_strict_schema_private_routing_and_own_headers(
    routed_provider, operation, raw
):
    provider, requests = routed_provider(response(raw))

    reply = await invoke(provider, operation)
    key_request, request = requests
    body = json.loads(request.content)
    assert key_request.method == "GET" and key_request.url.path.endswith("/key")
    assert request.url == "https://openrouter.ai/api/v1/chat/completions"
    assert request.headers["Authorization"] == "Bearer private-key"
    assert (
        "x-data-logging-enabled" not in request.headers and "OpenAI-Project" not in request.headers
    )
    assert body["provider"] == ROUTING
    assert body["model"] == VARIANT.model and body["temperature"] == 0
    recognition = operation in {"recognition", "conditions"}
    assert body["max_tokens"] == (8192 if recognition else 16384)
    assert body["reasoning"] == (
        {"enabled": False, "exclude": True}
        if recognition
        else {"max_tokens": 4096, "exclude": True}
    )
    assert body["response_format"]["json_schema"]["strict"] is True
    check_schema(body["response_format"]["json_schema"]["schema"])
    if operation != "material":
        assert "data:image/png;base64," in json.dumps(body)
    assert reply.actual_cost_usd == Decimal("0.0012345678")
    assert reply.generation_id == "gen-test" and reply.actual_provider == "Nebius"
    assert reply.returned_model == VARIANT.model and reply.prompt_version == "math-3"
    assert reply.processing["reasoning_tokens"] == 75
    assert "private thoughts" not in reply.model_dump_json()
    assert "private-key" not in json.dumps(reply.call_metadata())
    assert "reasoning" not in reply.raw.get("tasks", [{}])[0]


@pytest.mark.parametrize("actual_provider", ["Nebius", "DeepInfra"])
async def test_fallback_provider_is_recorded_without_changing_constraints(
    routed_provider, actual_provider
):
    data = json.loads(response(MATERIAL).content)
    data["provider"] = actual_provider
    provider, requests = routed_provider(httpx.Response(200, json=data))

    reply = await provider.generate_material("equations", "Корни")

    assert reply.actual_provider == actual_provider
    assert json.loads(requests[-1].content)["provider"] == ROUTING


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (401, "provider_auth"),
        (402, "provider_budget_exhausted"),
        (403, "provider_auth"),
        (404, "provider_route_unavailable"),
        (429, "provider_rate_limited"),
        (500, "provider_unavailable"),
        (503, "provider_unavailable"),
    ],
)
async def test_http_errors_keep_only_safe_call_metadata(routed_provider, status, code):
    provider, requests = routed_provider(
        httpx.Response(status, json={"error": {"message": "private data"}})
    )

    with pytest.raises(ProviderError) as caught:
        await provider.generate_material("equations", "Корни")

    assert caught.value.code == code
    assert caught.value.reply.processing["http_status"] == status
    assert caught.value.reply.actual_cost_usd is None
    assert "private data" not in caught.value.reply.model_dump_json()
    assert len(requests) == 2


@pytest.mark.parametrize(
    ("error", "code"),
    [
        (httpx.ReadTimeout("timeout"), "provider_timeout"),
        (httpx.ConnectError("down"), "provider_unavailable"),
    ],
)
async def test_network_errors_keep_operation_metadata(routed_provider, error, code):
    provider, _ = routed_provider(error)
    with pytest.raises(ProviderError) as caught:
        await provider.generate_material("equations", "Корни")
    assert caught.value.code == code
    assert caught.value.reply.processing["operation"] == "material"


@pytest.mark.parametrize(
    "raw",
    [
        {},
        {"explanation": "Без упражнений"},
        {**MATERIAL, "exercises": MATERIAL["exercises"][:2]},
        {**MATERIAL, "reasoning": "private thoughts"},
        {**MATERIAL, "exercises": [{**MATERIAL["exercises"][0], "extra": "bad"}] * 3},
    ],
)
async def test_missing_extra_or_incomplete_data_fails_server_validation(routed_provider, raw):
    provider, _ = routed_provider(response(raw))
    with pytest.raises(ProviderError) as caught:
        await provider.generate_material("equations", "Корни")
    assert caught.value.code == "provider_invalid_response"
    assert caught.value.reply.raw == {}
    assert caught.value.reply.actual_cost_usd is not None


@pytest.mark.parametrize(
    "bad_content", ['{"explanation":', "<think>private thoughts</think>{}", "```json\n{}\n```"]
)
async def test_invalid_json_never_persists_reasoning_or_raw_text(routed_provider, bad_content):
    provider, _ = routed_provider(httpx.Response(200, json=completion(bad_content)))
    with pytest.raises(ProviderError) as caught:
        await provider.generate_material("equations", "Корни")
    assert caught.value.reply.raw == {} and caught.value.reply.actual_cost_usd is None


async def test_length_finish_rejects_even_complete_json_and_keeps_billed_usage(routed_provider):
    data = json.loads(response(MATERIAL).content)
    data["choices"][0]["finish_reason"] = "length"
    provider, _ = routed_provider(httpx.Response(200, json=data))
    with pytest.raises(ProviderError) as caught:
        await provider.generate_material("equations", "Корни")
    assert caught.value.code == "provider_invalid_response"
    assert caught.value.reply.output_tokens == 300
    assert caught.value.reply.actual_cost_usd == Decimal("0.0012345678")


@pytest.mark.parametrize(
    "updates",
    [
        {"limit": None},
        {"limit": 2},
        {"limit_reset": "daily"},
        {"usage": None},
        {"limit_remaining": None},
        {"usage": "NaN"},
    ],
)
async def test_invalid_key_limit_blocks_paid_request(routed_provider, updates):
    provider, requests = routed_provider(response(MATERIAL), key=KEY | updates)
    with pytest.raises(ProviderError, match="provider_budget_configuration"):
        await provider.generate_material("equations", "Корни")
    assert len(requests) == 1


async def test_probe_stops_at_eighty_cents_without_spending_reserve(routed_provider):
    provider, requests = routed_provider(
        response(MATERIAL), key=KEY | {"usage": 0.8, "limit_remaining": 0.2}
    )
    with pytest.raises(ProviderError, match="provider_budget_exhausted"):
        await check_budget(provider.client, Decimal("0.8"))
    assert len(requests) == 1


async def test_unknown_cost_is_distinct_from_zero_and_estimate(routed_provider):
    data = json.loads(response(MATERIAL).content)
    data["usage"].pop("cost")
    provider, _ = routed_provider(httpx.Response(200, json=data))
    reply = await provider.generate_material("equations", "Корни")
    record = RunRecord()
    record.note(reply)
    record.price(VARIANT)
    assert record.actual_cost_usd is None and record.cost > 0
    reply.actual_cost_usd = Decimal(0)
    record = RunRecord()
    record.note(reply)
    assert record.actual_cost_usd == 0


def test_openrouter_uses_separate_key_and_requires_account_privacy_confirmation():
    settings = Settings(
        analysis_api_key="yandex-secret", openrouter_api_key="", openrouter_privacy_confirmed=False
    )
    with pytest.raises(ProviderNotConfigured, match="OPENROUTER_API_KEY"):
        make_provider(VARIANT, settings)
    settings.openrouter_api_key = SecretStr("openrouter-secret")
    with pytest.raises(ProviderNotConfigured, match="Safety Retention"):
        make_provider(VARIANT, settings)
