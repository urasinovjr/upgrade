import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.analysis.contract import FileSource, read_recognition, read_review
from app.analysis.drafting import review_tasks, task_input
from app.analysis.sim_provider import SimDraftProvider
from app.provider import ProviderError
from app.works.review import initial_draft
from app.works.schemas import Task
from provider_sim import sim
from tests.works import task

FILES = [FileSource(file_id="f1", content_type="image/png", data=b"png", page_order=[1])]


@pytest.fixture
async def provider():
    sim.simulator.reset(sim.SimConfig(profile="calm", time_scale=0.0))
    adapter = SimDraftProvider("http://sim", timeout=5)
    adapter.client = AsyncClient(transport=ASGITransport(app=sim.app), base_url="http://sim")
    yield adapter
    await adapter.close()
    sim.simulator.reset(sim.SimConfig())


async def analyse(provider: SimDraftProvider, *tasks: dict):
    draft = initial_draft([Task.model_validate(item) for item in tasks])
    inputs = [task_input(item) for item in draft.tasks]
    recognized = await provider.recognize(FILES, inputs)
    recognition = read_recognition(recognized.raw, inputs)
    sources = review_tasks(draft, recognition)
    reply = await provider.review(sources)
    return recognized, read_review(reply.raw, sources)


async def test_simulator_reply_passes_the_contract(provider):
    recognized, review = await analyse(
        provider,
        task("t1", condition="Решите x + 1 = 2", formula="", reference=""),
        task("t2", condition="Решите неравенство", formula="x^2<4"),
        task("t3", condition="Найдите производную функции"),
    )
    correct, error, unsupported = review.tasks

    assert (recognized.provider, recognized.model, recognized.prompt_version) == (
        "provider-sim",
        "sim-draft",
        "sim-1",
    )
    assert correct.supported and {step.verdict for step in correct.steps} == {"correct"}
    assert "error" in {step.verdict for step in error.steps}
    assert error.topic_id == "inequalities"
    assert error.gap is not None and error.gap.topic_id == "domain"
    assert unsupported.supported is False and unsupported.reason


async def test_simulator_reply_is_deterministic(provider):
    first = await analyse(provider, task("t1", formula="x^2<4"))
    second = await analyse(provider, task("t1", formula="x^2<4"))

    assert [step.verdict for step in first[1].tasks[0].steps] == [
        step.verdict for step in second[1].tasks[0].steps
    ]


async def test_task_without_condition_is_not_matched(provider):
    inputs = [task_input(Task.model_validate(task("t1", condition="", formula="")))]

    reply = await provider.recognize(FILES, inputs)

    assert read_recognition(reply.raw, inputs).tasks[0].matched is False


async def test_adapter_keeps_a_body_that_is_not_json(provider):
    provider.client = AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, text="oops")),
        base_url="http://sim",
    )

    reply = await provider.review([])

    assert reply.raw == {"text": "oops"}


@pytest.mark.parametrize(
    ("response", "code"),
    [(httpx.Response(429), "provider_rate_limited"), (httpx.Response(503), "provider_unavailable")],
)
async def test_adapter_maps_provider_failures(provider, response, code):
    provider.client = AsyncClient(
        transport=httpx.MockTransport(lambda request: response), base_url="http://sim"
    )

    with pytest.raises(ProviderError, match=code):
        await provider.review([])


async def test_stand_endpoints_keep_their_answers(provider):
    async with AsyncClient(transport=ASGITransport(app=sim.app), base_url="http://sim") as client:
        ocr = await client.post("/ocr", json={"upload_id": "u1", "pages": 2})
        analysis = await client.post("/analyze", json={"upload_id": "u1", "text": "t"})

    assert ocr.json() == {"text": "recognized 2 pages of u1"}
    assert analysis.json() == {"steps": 6, "errors": 1, "topic": "logarithmic-inequalities"}
