import json
import re
import time
from decimal import Decimal

import httpx
from pydantic import BaseModel

from app.analysis import openrouter
from app.analysis.contract import ConditionImage, ProviderReply, ReviewTask, TaskInput
from app.analysis.prompts import PROMPTS, review_messages
from app.analysis.quality import retry_context, retry_reason
from app.analysis.variants import Variant
from app.provider import ProviderError
from app.redaction import PageImage

BBOX_SCALE = 1000
RAW_TEXT_LIMIT = 2000
THINKING = re.compile(r"<think>.*?</think>", re.DOTALL)
FENCE = re.compile(r"^```(?:json)?\s*|\s*```$")


def inline_refs(node, definitions: dict):
    if isinstance(node, list):
        return [inline_refs(item, definitions) for item in node]
    if not isinstance(node, dict):
        return node
    if "$ref" in node:
        return inline_refs(definitions[node["$ref"].split("/")[-1]], definitions)
    return {key: inline_refs(value, definitions) for key, value in node.items() if key != "$defs"}


def response_format(name: str, answer: type[BaseModel]) -> dict:
    schema = answer.model_json_schema()
    return {
        "type": "json_schema",
        "json_schema": {
            "name": name,
            "schema": inline_refs(schema, schema.get("$defs", {})),
            "strict": True,
        },
    }


def text_reply(text: str, **extra: str) -> dict:
    return {"text": text[:RAW_TEXT_LIMIT], **extra}


def read_content(data: dict) -> dict:
    try:
        choice = data["choices"][0]
        text = choice["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return text_reply(json.dumps(data, ensure_ascii=False))
    if not isinstance(text, str):
        return text_reply(str(text))
    if choice.get("finish_reason") == "length":
        return text_reply(text, finish_reason="length")
    cleaned = FENCE.sub("", THINKING.sub("", text).strip())
    try:
        answer = json.loads(cleaned)
    except ValueError:
        return text_reply(text)
    return answer if isinstance(answer, dict) else text_reply(text)


def read_usage(data: dict) -> tuple[int, int]:
    usage = data.get("usage")
    if not isinstance(usage, dict):
        return 0, 0
    tokens = [usage.get("prompt_tokens"), usage.get("completion_tokens")]
    if not all(
        isinstance(value, int) and not isinstance(value, bool) and value >= 0 for value in tokens
    ):
        return 0, 0
    return tokens[0], tokens[1]


def page_index(number) -> int | None:
    if isinstance(number, int) and not isinstance(number, bool) and number >= 1:
        return number - 1
    return None


def to_region(bbox) -> dict | None:
    if not isinstance(bbox, list) or len(bbox) != 4:
        return None
    if not all(isinstance(value, int | float) and not isinstance(value, bool) for value in bbox):
        return None
    left, top, right, bottom = (value / BBOX_SCALE for value in bbox)
    if not (0 <= left < right <= 1 and 0 <= top < bottom <= 1):
        return None
    return {"x": left, "y": top, "width": right - left, "height": bottom - top}


def add_regions(answer: dict) -> dict:
    tasks = answer.get("tasks")
    for task in tasks if isinstance(tasks, list) else []:
        steps = task.get("steps") if isinstance(task, dict) else None
        for step in steps if isinstance(steps, list) else []:
            if isinstance(step, dict):
                step["page"] = page_index(step.get("page_number"))
                step["region"] = to_region(step.get("bbox"))
    return answer


def read_body(response: httpx.Response) -> dict:
    try:
        data = response.json()
    except ValueError:
        return {"text": response.text}
    return data if isinstance(data, dict) else {"text": response.text}


def quality_content(data: dict) -> dict:
    def without_reasoning(node):
        if isinstance(node, list):
            return [without_reasoning(item) for item in node]
        if isinstance(node, dict):
            return {
                key: without_reasoning(value)
                for key, value in node.items()
                if key not in {"reasoning", "reasoning_content", "analysis"}
            }
        return node

    try:
        content = data["choices"][0]["message"]["content"]
        if not isinstance(content, str):
            return {}
        cleaned = THINKING.sub("", content)
        try:
            parsed = json.loads(cleaned)
        except ValueError:
            return {"invalid_content": cleaned}
        return (
            without_reasoning(parsed) if isinstance(parsed, dict) else {"invalid_content": cleaned}
        )
    except (KeyError, IndexError, TypeError):
        return {}


def failure_code(status: int) -> str:
    if status == 429:
        return "provider_rate_limited"
    if status in (401, 403):
        return "provider_auth"
    if status == 402:
        return "provider_budget_exhausted"
    if status == 404:
        return "provider_route_unavailable"
    if status < 500:
        return "provider_rejected"
    return "provider_unavailable"


class OpenAiDraftProvider:
    def __init__(
        self,
        variant: Variant,
        api_key: str,
        folder_id: str,
        timeout: float,
        transport: httpx.AsyncBaseTransport | None = None,
        budget_stop_at: Decimal = Decimal("1"),
    ):
        self.variant = variant
        self.budget_stop_at = budget_stop_at
        self.prompt = PROMPTS[variant.prompt_version]
        self.model_uri = variant.model_uri.format(folder=folder_id)
        headers = {"Authorization": f"{variant.auth_scheme} {api_key}"}
        if variant.provider == "yandex-ai-studio":
            headers["x-data-logging-enabled"] = "false"
        if variant.project_header:
            headers[variant.project_header] = folder_id
        self.client = httpx.AsyncClient(
            base_url=variant.base_url,
            headers=headers,
            timeout=timeout,
            trust_env=False,
            transport=transport,
        )

    async def recognize(self, pages: list[PageImage], tasks: list[TaskInput]) -> ProviderReply:
        messages = self.prompt.recognize_messages(pages, tasks)
        reply = await self.ask(messages, "recognition", self.prompt.RecognitionAnswer)
        reply.raw = add_regions(reply.raw)
        return reply

    async def review(
        self, tasks: list[ReviewTask], conditions: list[ConditionImage]
    ) -> ProviderReply:
        messages = review_messages(self.prompt, tasks, conditions)
        answer = (
            openrouter.ReviewAnswer
            if self.variant.provider == "openrouter" and self.variant.prompt_version != "math-4"
            else self.prompt.ReviewAnswer
        )
        return await self.ask(messages, "review", answer)

    async def recognize_conditions(self, text: str, pages: list[PageImage]) -> ProviderReply:
        from app.homework.prompts import ConditionsAnswer, conditions_messages

        return await self.ask(conditions_messages(text, pages), "conditions", ConditionsAnswer)

    async def generate_material(self, topic_id: str, reason: str) -> ProviderReply:
        from app.homework.prompts import MaterialContent, material_messages

        return await self.ask(material_messages(topic_id, reason), "material", MaterialContent)

    async def ask(self, messages: list[dict], name: str, answer: type[BaseModel]) -> ProviderReply:
        correction = retry_context.get()
        if correction is not None and correction["stage"] == name:
            messages = [
                *messages,
                {
                    "role": "user",
                    "content": "Проверь предыдущий результат этого этапа ещё раз. "
                    + retry_reason(correction["reason"])
                    + " Исправь ответ по исходным данным. Сохрани все строки и идентификаторы. "
                    "Используй общий номер «Страница N» из подписи, а не номер листа внутри файла. "
                    "Верни только JSON по схеме.",
                },
            ]
        body = {
            "model": self.model_uri,
            "messages": messages,
            "temperature": self.variant.temperature,
            "max_tokens": self.variant.max_tokens,
            "response_format": response_format(name, answer),
        }
        routed = self.variant.provider == "openrouter"
        if routed:
            body.update(openrouter.parameters(name))
            definition = body["response_format"]["json_schema"]
            definition["schema"] = openrouter.strict_schema(definition["schema"])
            await openrouter.check_budget(self.client, self.budget_stop_at)
        started = time.monotonic()
        try:
            response = await self.client.post("/chat/completions", json=body)
        except httpx.TimeoutException as error:
            reply = self.failed_reply(body, started) if routed else None
            raise ProviderError("provider_timeout", reply) from error
        except httpx.HTTPError as error:
            reply = self.failed_reply(body, started) if routed else None
            raise ProviderError("provider_unavailable", reply) from error
        data = read_body(response)
        reply = self.reply({}, read_usage(data))
        if routed:
            openrouter.metadata(reply, data, body, round((time.monotonic() - started) * 1000))
            reply.processing["http_status"] = response.status_code
        status = response.status_code
        embedded = data.get("error")
        if routed and isinstance(embedded, dict) and isinstance(embedded.get("code"), int):
            status = embedded["code"]
        if status >= 400:
            raise ProviderError(failure_code(status), reply if routed else None)
        if routed:
            if self.variant.prompt_version == "math-4" and name in {"recognition", "review"}:
                reply.raw = quality_content(data)
            try:
                reply.raw = openrouter.content(data, answer)
            except ProviderError as error:
                error.reply = reply
                raise
        else:
            reply.raw = read_content(data)
        return reply

    def failed_reply(self, body: dict, started: float) -> ProviderReply:
        reply = self.reply({}, (0, 0))
        return openrouter.metadata(reply, {}, body, round((time.monotonic() - started) * 1000))

    def reply(self, raw: dict, usage: tuple[int, int]) -> ProviderReply:
        return ProviderReply(
            raw=raw,
            provider=self.variant.provider,
            model=self.variant.model,
            prompt_version=self.variant.prompt_version,
            input_tokens=usage[0],
            output_tokens=usage[1],
        )

    async def close(self) -> None:
        await self.client.aclose()
