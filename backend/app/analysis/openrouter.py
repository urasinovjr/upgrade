import json
from decimal import Decimal, InvalidOperation

import httpx
from pydantic import ValidationError

from app.analysis.contract import ProviderReply
from app.analysis.prompts.math_1 import Answer, GapAnswer, VerdictAnswer
from app.provider import ProviderError

ROUTING = {
    "order": ["nebius"],
    "allow_fallbacks": True,
    "require_parameters": True,
    "data_collection": "deny",
    "zdr": True,
    "max_price": {"prompt": 0.50, "completion": 3},
}
FINAL_ERRORS = {
    "provider_auth",
    "provider_rejected",
    "provider_budget_exhausted",
    "provider_budget_configuration",
    "provider_route_unavailable",
}


class ReviewedTaskAnswer(Answer):
    task_id: str
    supported: bool
    reason: str
    topic_id: str
    task_type_id: str
    steps: list[VerdictAnswer]
    gap: GapAnswer | None
    feedback: str


class ReviewAnswer(Answer):
    tasks: list[ReviewedTaskAnswer]


def amount(value) -> Decimal | None:
    if isinstance(value, bool) or not isinstance(value, int | float | str | Decimal):
        return None
    try:
        result = Decimal(str(value))
    except InvalidOperation:
        return None
    return result if result.is_finite() and result >= 0 else None


def parameters(operation: str) -> dict:
    recognition = operation in {"recognition", "conditions"}
    return {
        "provider": {
            **ROUTING,
            "order": list(ROUTING["order"]),
            "max_price": dict(ROUTING["max_price"]),
        },
        "reasoning": {"enabled": False, "exclude": True}
        if recognition
        else {
            "max_tokens": 4096,
            "exclude": True,
        },
        "max_tokens": 8192 if recognition else 16384,
    }


def strict_schema(node):
    if isinstance(node, list):
        return [strict_schema(item) for item in node]
    if not isinstance(node, dict):
        return node
    result = {key: strict_schema(value) for key, value in node.items() if key != "default"}
    if result.get("type") == "object":
        result["additionalProperties"] = False
        result["required"] = list(result.get("properties", {}))
    return result


def content(data: dict, answer) -> dict:
    try:
        choice = data["choices"][0]
        if choice["finish_reason"] != "stop":
            raise ValueError("finish_reason")
        raw = json.loads(choice["message"]["content"])
        answer.model_validate(raw, strict=True)
    except (ValueError, KeyError, IndexError, TypeError, ValidationError) as error:
        raise ProviderError("provider_invalid_response") from error
    return raw


def metadata(reply: ProviderReply, data: dict, body: dict, elapsed_ms: int) -> ProviderReply:
    reply.generation_id = data.get("id") if isinstance(data.get("id"), str) else None
    reply.actual_provider = data.get("provider") if isinstance(data.get("provider"), str) else None
    reply.returned_model = data.get("model") if isinstance(data.get("model"), str) else None
    usage = data.get("usage")
    reply.actual_cost_usd = amount(usage.get("cost")) if isinstance(usage, dict) else None
    reply.processing = {
        key: body[key] for key in ("temperature", "max_tokens", "provider", "reasoning")
    }
    reply.processing.update(
        operation=body["response_format"]["json_schema"]["name"], elapsed_ms=elapsed_ms
    )
    if isinstance(usage, dict):
        details = usage.get("completion_tokens_details")
        if isinstance(details, dict):
            tokens = details.get("reasoning_tokens")
            if isinstance(tokens, int) and not isinstance(tokens, bool) and tokens >= 0:
                reply.processing["reasoning_tokens"] = tokens
    return reply


async def check_budget(client: httpx.AsyncClient, stop_at: Decimal = Decimal("1")) -> dict:
    try:
        response = await client.get("/key")
    except httpx.TimeoutException as error:
        raise ProviderError("provider_timeout") from error
    except httpx.HTTPError as error:
        raise ProviderError("provider_unavailable") from error
    if response.status_code in {401, 403}:
        raise ProviderError("provider_auth")
    if response.status_code == 402:
        raise ProviderError("provider_budget_exhausted")
    if response.status_code == 429:
        raise ProviderError("provider_rate_limited")
    if response.status_code >= 400:
        raise ProviderError("provider_unavailable")
    try:
        data = response.json()["data"]
        limit, usage, remaining = (
            amount(data.get(key)) for key in ("limit", "usage", "limit_remaining")
        )
        if limit is None or not 0 < limit <= 1 or data.get("limit_reset") is not None:
            raise ValueError("limit")
        if usage is None or remaining is None:
            raise ValueError("usage")
    except (ValueError, KeyError, TypeError, AttributeError) as error:
        raise ProviderError("provider_budget_configuration") from error
    if usage >= stop_at or remaining <= 0:
        raise ProviderError("provider_budget_exhausted")
    return {"limit": str(limit), "usage": str(usage), "remaining": str(remaining)}
