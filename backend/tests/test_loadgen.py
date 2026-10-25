import asyncio
import csv
import json

import httpx
import pytest

from app.provider import Provider, ProviderError
from app.queue import Job
from app.worker import handle_job
from loadgen import analyze, run
from loadgen.matrix import build_plan, parse
from loadgen.run import run_name
from tests.conftest import FakeProvider, worker_context
from tests.test_worker import claimed_job


class RateLimited(FakeProvider):
    async def recognize(self, upload_id: str, pages: int) -> str:
        raise ProviderError("provider_rate_limited")


def test_run_names_keep_conditions_apart():
    assert run_name("async", "normal", 5, 1) == "async-normal-x5-s1"
    assert run_name("async", "degraded", 5, 1, 1, "t110-cap4") == "async-degraded-x5-s1-ct110-cap4"
    assert run_name("sync-idem", "normal", 1, 2, 3) == "sync-idem-normal-x1-s2-w3"


def test_matrix_plan_follows_the_arguments():
    args = parse(["--modes", "sync-idem", "--profiles", "normal", "--levels", "1", "5"])

    plan = build_plan(args)

    assert len(plan) == 10
    assert plan[0] == ("sync-idem", "normal", 1, 1, 1, "base")


def write_run(folder, name: str, meta: dict, rows: list[dict]) -> None:
    (folder / f"{name}.json").write_text(json.dumps(meta))
    with (folder / f"{name}.csv").open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


POLLED_ROW = {
    "accepted": "True",
    "accept_s": "0.01",
    "ready_s": "2.0",
    "polled_ready_s": "2.4",
    "poll_count": "12",
    "results": "1",
    "works": "1",
    "failed": "False",
}
ASYNC_META = {
    "mode": "async",
    "profile": "normal",
    "level": 1,
    "workers": 1,
    "condition": "t110-cap4",
    "protocol": 2,
    "time_scale": 0.1,
    "provider": {"analyze_calls": 1},
}


def test_protocol_two_measures_readiness_by_polling(tmp_path, monkeypatch):
    runs = tmp_path / "runs"
    runs.mkdir()
    monkeypatch.setitem(analyze.PROTOCOL_DIRS, 2, tmp_path)
    write_run(runs, "one", ASYNC_META, [POLLED_ROW])

    [summary] = analyze.summarize(2)

    assert summary["condition"] == "t110-cap4"
    assert summary["ready_p95_real_s"] == pytest.approx(24.0)
    assert summary["stored_ready_p95_real_s"] == pytest.approx(20.0)
    assert summary["polls_per_upload"] == 12
    assert summary["meets_h1"] is True


def test_runs_without_accepted_uploads_are_left_out(tmp_path, monkeypatch):
    runs = tmp_path / "runs"
    runs.mkdir()
    monkeypatch.setitem(analyze.PROTOCOL_DIRS, 2, tmp_path)
    monkeypatch.setattr(run, "RESULTS_DIR", runs)
    write_run(runs, "good", {**ASYNC_META, "valid": True}, [POLLED_ROW])
    write_run(runs, "broken", {**ASYNC_META, "valid": False}, [POLLED_ROW])

    [summary] = analyze.summarize(2)

    assert summary["runs"] == 1
    assert analyze.invalid_runs(2) == ["broken"]
    assert run.run_done("good") is True
    assert run.run_done("broken") is False
    assert run.run_done("missing") is False


async def test_provider_cap_limits_parallel_calls():
    active = 0
    peak = 0

    async def answer(request: httpx.Request) -> httpx.Response:
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.02)
        active -= 1
        return httpx.Response(200, json={"text": "ok"})

    provider = Provider("http://sim", 5, concurrency=2)
    provider.client = httpx.AsyncClient(
        base_url="http://sim", transport=httpx.MockTransport(answer)
    )
    await asyncio.gather(*(provider.recognize(f"u{index}", 1) for index in range(6)))
    await provider.close()

    assert peak == 2


async def test_stand_rate_limit_is_deferred_without_spending_an_attempt(sessions, test_settings):
    job = await claimed_job(sessions, max_attempts=1)

    await handle_job(worker_context(sessions, test_settings, RateLimited()), job)

    async with sessions() as session:
        stored = await session.get(Job, job.id)
    assert (stored.status, stored.attempts, stored.deferrals) == ("retrying", 0, 1)
    assert stored.last_error == "provider_rate_limited"
