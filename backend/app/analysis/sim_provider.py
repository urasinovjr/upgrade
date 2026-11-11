import base64

import httpx

from app.analysis.contract import ConditionImage, ProviderReply, ReviewTask, TaskInput
from app.knowledge.task_types import TASK_TYPES
from app.knowledge.topics import TOPICS
from app.provider import ProviderError
from app.redaction import PageImage

PROVIDER_NAME = "provider-sim"
MODEL = "sim-draft"
PROMPT_VERSION = "sim-1"
RAW_TEXT_LIMIT = 2000


def page_payload(page: PageImage) -> dict:
    return {
        **page.model_dump(exclude={"data"}),
        "data": base64.b64encode(page.data).decode(),
    }


def topic_payload() -> list[dict]:
    return [
        {"id": topic.id, "name": topic.name, "prerequisites": list(topic.prerequisites)}
        for topic in TOPICS
    ]


def read_usage(raw: dict) -> tuple[int, int]:
    usage = raw.get("usage")
    if not isinstance(usage, dict):
        return 0, 0
    tokens = [usage.get("input_tokens"), usage.get("output_tokens")]
    if not all(isinstance(value, int) and value >= 0 for value in tokens):
        return 0, 0
    return tokens[0], tokens[1]


def read_body(response: httpx.Response) -> dict:
    try:
        data = response.json()
    except ValueError:
        return {"text": response.text[:RAW_TEXT_LIMIT]}
    if not isinstance(data, dict):
        return {"text": response.text[:RAW_TEXT_LIMIT]}
    return data


class SimDraftProvider:
    def __init__(self, base_url: str, timeout: float):
        self.client = httpx.AsyncClient(base_url=base_url, timeout=timeout, trust_env=False)

    async def recognize(self, pages: list[PageImage], tasks: list[TaskInput]) -> ProviderReply:
        payload = {
            "pages": [page_payload(page) for page in pages],
            "tasks": [task.model_dump() for task in tasks],
        }
        return await self.post("/draft/recognize", payload)

    async def recognize_conditions(self, text: str, pages: list[PageImage]) -> ProviderReply:
        tasks = [
            {
                "title": f"Задание {number}",
                "condition": line,
                "formula": "",
                "topic_id": "",
                "task_type_id": "",
                "file_ids": [],
                "exam": None,
            }
            for number, line in enumerate(text.split("\n\n"), 1)
            if line.strip()
        ]
        if not text.strip() and pages:
            tasks = [
                {
                    "title": "Задание 1",
                    "condition": "В демонстрации перепишите условие с оригинала.",
                    "formula": "",
                    "topic_id": "",
                    "task_type_id": "",
                    "file_ids": list({page.file_id for page in pages}),
                    "exam": None,
                }
            ]
        return ProviderReply(
            raw={"tasks": tasks}, provider=PROVIDER_NAME, model=MODEL, prompt_version="homework-1"
        )

    async def generate_material(self, topic_id: str, reason: str) -> ProviderReply:
        return ProviderReply(
            raw={
                "explanation": (
                    "Пример отработки. При сложении дробей приведите их к общему знаменателю."
                ),
                "exercises": [
                    {
                        "condition": "Вычислите 1/2 + 1/3.",
                        "answer": "5/6",
                        "solution": "1/2 + 1/3 = 3/6 + 2/6 = 5/6.",
                    },
                    {
                        "condition": "Вычислите 1/4 + 1/6.",
                        "answer": "5/12",
                        "solution": "1/4 + 1/6 = 3/12 + 2/12 = 5/12.",
                    },
                    {
                        "condition": "Вычислите 2/3 + 3/4.",
                        "answer": "17/12",
                        "solution": "2/3 + 3/4 = 8/12 + 9/12 = 17/12.",
                    },
                ],
            },
            provider=PROVIDER_NAME,
            model=MODEL,
            prompt_version="homework-1",
        )

    async def review(
        self, tasks: list[ReviewTask], conditions: list[ConditionImage]
    ) -> ProviderReply:
        payload = {
            "tasks": [task.model_dump() for task in tasks],
            "topics": topic_payload(),
            "task_types": [
                {"id": item.id, "topic_ids": list(item.topic_ids)}
                for item in TASK_TYPES
                if item.in_scope
            ],
        }
        return await self.post("/draft/review", payload)

    async def post(self, path: str, payload: dict) -> ProviderReply:
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
        raw = read_body(response)
        input_tokens, output_tokens = read_usage(raw)
        return ProviderReply(
            raw=raw,
            provider=PROVIDER_NAME,
            model=MODEL,
            prompt_version=PROMPT_VERSION,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )

    async def close(self) -> None:
        await self.client.aclose()
