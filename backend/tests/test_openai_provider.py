import json

import httpx
import pytest

from app.analysis.contract import (
    ConditionArea,
    ConditionImage,
    InvalidReply,
    Region,
    ReviewTask,
    StepInput,
    TaskInput,
    read_recognition,
    read_review,
)
from app.analysis.openai_provider import OpenAiDraftProvider, to_region
from app.analysis.quality import retry_context
from app.analysis.variants import get_variant
from app.provider import ProviderError
from app.redaction import PageImage
from tests.test_copy import LEGACY_REASONS

PAGES = [
    PageImage(
        index=index,
        file_id=f"f{index}",
        page=1,
        content_type="image/png",
        data=f"page-{index}".encode(),
        width=100,
        height=200,
    )
    for index in range(2)
]
TASKS = [
    TaskInput(
        id="t1", condition="Решите уравнение", formula="x^2=4", reference="", condition_file_ids=[]
    ),
    TaskInput(id="t2", condition="", formula="", reference="", condition_file_ids=["f1"]),
]
REVIEW_TASKS = [
    ReviewTask(
        **TASKS[0].model_dump(),
        steps=[
            StepInput(id="s1", latex="x^2=4", legible=True),
            StepInput(id="s2", latex="x=2", legible=True),
        ],
    )
]
RECOGNITION = {
    "tasks": [
        {
            "task_id": "t1",
            "matched": True,
            "steps": [
                {"latex": "x^2=4", "legible": True, "page_number": 1, "bbox": [100, 200, 600, 300]},
                {"latex": "x=2", "legible": False, "page_number": 9, "bbox": [500, 0, 100, 10]},
            ],
        },
        {"task_id": "t2", "matched": False, "steps": []},
    ]
}
REVIEW = {
    "tasks": [
        {
            "task_id": "t1",
            "reasoning": "Потерян корень -2.",
            "supported": True,
            "reason": "",
            "topic_id": "equations",
            "steps": [
                {"id": "s1", "verdict": "correct", "explanation": ""},
                {"id": "s2", "verdict": "error", "explanation": "Потерян корень x=-2."},
            ],
            "gap": {"topic_id": "equations", "reason": "Не учитывает два корня."},
            "feedback": "Проверьте оба корня.",
        }
    ]
}


def completion(content: str, finish_reason: str = "stop") -> dict:
    return {
        "choices": [{"message": {"content": content}, "finish_reason": finish_reason}],
        "usage": {"prompt_tokens": 1500, "completion_tokens": 300},
    }


class Recorder:
    def __init__(self, *responses: httpx.Response | Exception):
        self.responses = list(responses)
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response

    def body(self, index: int = 0) -> dict:
        return json.loads(self.requests[index].content)


def answer(data: dict, finish_reason: str = "stop") -> httpx.Response:
    return httpx.Response(200, json=completion(json.dumps(data), finish_reason))


@pytest.fixture
async def make_provider():
    providers = []

    def build(
        *responses: httpx.Response | Exception, variant: str = "yandex-qwen36-v1"
    ) -> tuple[OpenAiDraftProvider, Recorder]:
        recorder = Recorder(*responses)
        provider = OpenAiDraftProvider(
            get_variant(variant),
            "secret-key",
            "b1g",
            timeout=5,
            transport=httpx.MockTransport(recorder),
        )
        providers.append(provider)
        return provider, recorder

    yield build
    for provider in providers:
        await provider.close()


@pytest.mark.prd(1)
async def test_recognize_sends_pages_in_order_with_strict_schema(make_provider):
    provider, recorder = make_provider(answer(RECOGNITION))

    reply = await provider.recognize(PAGES, TASKS)
    request = recorder.requests[0]
    body = recorder.body()
    [system, user] = body["messages"]
    images = [part["image_url"]["url"] for part in user["content"] if part["type"] == "image_url"]
    schema = body["response_format"]["json_schema"]

    assert request.url == "https://ai.api.cloud.yandex.net/v1/chat/completions"
    assert request.headers["Authorization"] == "Api-Key secret-key"
    assert request.headers["OpenAI-Project"] == "b1g"
    assert request.headers["x-data-logging-enabled"] == "false"
    assert body["model"] == "gpt://b1g/qwen3.6-35b-a3b"
    assert body["temperature"] == 0
    assert system["role"] == "system"
    assert images == ["data:image/png;base64,cGFnZS0w", "data:image/png;base64,cGFnZS0x"]
    assert "Условие на страницах: 2" in user["content"][-1]["text"]
    assert schema["strict"] is True
    assert "$ref" not in json.dumps(schema) and "$defs" not in json.dumps(schema)
    assert (reply.provider, reply.model, reply.prompt_version) == (
        "yandex-ai-studio",
        "qwen3.6-35b-a3b",
        "math-1",
    )
    assert (reply.input_tokens, reply.output_tokens) == (1500, 300)


async def test_recognized_boxes_become_page_regions(make_provider):
    provider, _ = make_provider(answer(RECOGNITION))

    reply = await provider.recognize(PAGES, TASKS)
    recognition = read_recognition(reply.raw, TASKS)
    [placed, lost] = recognition.tasks[0].steps

    assert placed.page == 0
    assert placed.region is not None
    assert placed.region.model_dump() == pytest.approx(
        {"x": 0.1, "y": 0.2, "width": 0.5, "height": 0.1}
    )
    assert (lost.page, lost.region) == (8, None)
    assert recognition.tasks[1].matched is False


@pytest.mark.parametrize(
    "bbox",
    [None, [1, 2, 3], [0, 0, 1001, 10], [10, 10, 10, 20], ["a", 0, 1, 1], [True, 0, 1, 1]],
)
def test_bad_boxes_are_dropped(bbox):
    assert to_region(bbox) is None


async def test_review_is_text_only_and_passes_the_contract(make_provider):
    provider, recorder = make_provider(answer(REVIEW))

    reply = await provider.review(REVIEW_TASKS, [])
    review = read_review(reply.raw, REVIEW_TASKS)
    text = json.dumps(recorder.body(), ensure_ascii=False)

    assert "image_url" not in text
    assert "x=2" in text and "equations" in text
    assert review.tasks[0].steps[1].verdict == "error"
    assert review.tasks[0].gap is not None


async def test_thinking_and_code_fences_are_removed(make_provider):
    content = "<think>сначала подумаю</think>\n```json\n" + json.dumps(REVIEW) + "\n```"
    provider, _ = make_provider(httpx.Response(200, json=completion(content)))

    reply = await provider.review(REVIEW_TASKS, [])

    assert read_review(reply.raw, REVIEW_TASKS).tasks[0].task_id == "t1"


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, json=completion('{"tasks": [')),
        httpx.Response(200, json=completion(json.dumps(REVIEW), "length")),
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"choices": []}),
    ],
)
async def test_unusable_answers_are_kept_as_text(make_provider, response):
    provider, _ = make_provider(response)

    reply = await provider.review(REVIEW_TASKS, [])

    assert "text" in reply.raw
    with pytest.raises(InvalidReply):
        read_review(reply.raw, REVIEW_TASKS)


@pytest.mark.parametrize(
    ("response", "code"),
    [
        (httpx.Response(429), "provider_rate_limited"),
        (httpx.Response(401), "provider_auth"),
        (httpx.Response(403), "provider_auth"),
        (httpx.Response(400, json={"error": "bad schema"}), "provider_rejected"),
        (httpx.Response(503), "provider_unavailable"),
        (httpx.ReadTimeout("slow"), "provider_timeout"),
        (httpx.ConnectError("down"), "provider_unavailable"),
    ],
)
async def test_failures_map_to_provider_errors(make_provider, response, code):
    provider, _ = make_provider(response)

    with pytest.raises(ProviderError) as caught:
        await provider.review(REVIEW_TASKS, [])

    assert caught.value.code == code


async def test_math_2_shows_condition_images_and_asks_for_the_task_type(make_provider):
    typed = {"tasks": [{**REVIEW["tasks"][0], "task_type_id": "quadratic_eq"}]}
    provider, recorder = make_provider(answer(typed), variant="yandex-qwen36-v2")
    condition = ConditionImage(task_id="t1", image=PAGES[1])

    reply = await provider.review(REVIEW_TASKS, [condition])
    body = recorder.body()
    [_, user] = body["messages"]
    parts = user["content"]
    images = [part["image_url"]["url"] for part in parts if part["type"] == "image_url"]
    schema = body["response_format"]["json_schema"]["schema"]
    task_schema = json.dumps(schema, ensure_ascii=False)

    assert reply.prompt_version == "math-2"
    assert len(images) == 1 and images[0].endswith("cGFnZS0x")
    assert parts[-2] == {"type": "text", "text": "Условие задачи t1"}
    assert '"condition_is_image": true' in parts[0]["text"]
    assert "Тригонометрия:" in parts[0]["text"] and "derivative" in parts[0]["text"]
    assert "task_type_id" in task_schema
    assert read_review(reply.raw, REVIEW_TASKS).tasks[0].task_type_id == "quadratic_eq"


async def test_math_2_marks_the_condition_area_for_recognition(make_provider):
    provider, recorder = make_provider(answer(RECOGNITION), variant="yandex-qwen36-v2")
    area = ConditionArea(file_id="f1", page=1, region=Region(x=0, y=0, width=1, height=0.25))
    tasks = [TASKS[0], TASKS[1].model_copy(update={"condition_region": area})]

    await provider.recognize(PAGES, tasks)
    [_, user] = recorder.body()["messages"]

    assert "Область условия: страница 2, bbox [0, 0, 1000, 250]" in user["content"][-1]["text"]


@pytest.mark.parametrize("reason", [*LEGACY_REASONS, "unknown"])
async def test_copy_changes_preserve_the_entire_semantic_retry_request(make_provider, reason):
    provider, recorder = make_provider(answer(RECOGNITION), answer(RECOGNITION))
    await provider.recognize(PAGES, TASKS)
    token = retry_context.set({"stage": "recognition", "reason": reason})
    try:
        await provider.recognize(PAGES, TASKS)
    finally:
        retry_context.reset(token)
    original = recorder.body(0)
    retried = recorder.body(1)
    messages = retried.pop("messages")
    assert messages[:-1] == original.pop("messages")
    assert retried == original
    fallback = "Разбор не прошёл проверку качества. Сверьте задачу вручную."
    assert messages[-1] == {
        "role": "user",
        "content": "Проверь предыдущий результат этого этапа ещё раз. "
        + LEGACY_REASONS.get(reason, fallback)
        + " Исправь ответ по исходным данным. Сохрани все строки и идентификаторы. "
        "Используй общий номер «Страница N» из подписи, а не номер листа внутри файла. "
        "Верни только JSON по схеме.",
    }
