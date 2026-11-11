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
from loadgen.scenario import Timing, Upload
from loadgen.stand import ready_times
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


def test_bootstrap_resamples_independent_runs():
    low, high = analyze.bootstrap_p95([[0.0] * 20, [100.0] * 20])

    assert low == 0.0
    assert high == 100.0


def test_bootstrap_does_not_hide_a_run_without_observed_latency():
    assert analyze.bootstrap_p95([[1.0, 2.0], []]) == (None, None)


async def test_protocol_three_saves_a_run_without_successful_responses(tmp_path, monkeypatch):
    async def no_op(*args):
        return None

    async def clock(*args):
        return 0.0

    async def empty(*args):
        return {}

    async def failed_upload(*args):
        return {"first_send": 100.0, "upload_id": "one", "accepted": False}

    for name in ("ensure_running", "reset_database", "configure_provider", "wait_until_settled"):
        monkeypatch.setattr(run, name, no_op)
    monkeypatch.setattr(run, "clock_offset", clock)
    monkeypatch.setattr(run, "collect_outcomes", empty)
    monkeypatch.setattr(run, "provider_stats", empty)
    monkeypatch.setattr(run, "send_upload", failed_upload)
    monkeypatch.setattr(run, "build_uploads", lambda *args: [Upload("one", "t", "s", 1, 0.0)])
    monkeypatch.setattr(run, "PROTOCOL", 3)
    monkeypatch.setattr(run, "RESULTS_DIR", tmp_path)

    path = await run.run_once(None, "async", "normal", 1, 1, False, fault="none")

    metadata = json.loads(path.with_suffix(".json").read_text())
    rows = list(csv.DictReader(path.open()))
    assert metadata["valid"] is True
    assert metadata["uploads"] == 1
    assert rows[0]["accepted"] == "False"
    assert rows[0]["works"] == "0"


def test_real_time_scenario_scales_all_client_delays():
    timing = Timing.from_scale(1.0)

    assert timing.window_seconds == 600.0
    assert timing.client_timeout == 30.0
    assert timing.retry_pause == 10.0
    assert timing.poll_interval == 2.0
    assert timing.crash_at == (200.0, 400.0)


def test_api_failure_and_no_failure_have_separate_run_names():
    assert run_name("async", "normal", 1, 1, fault="api").endswith("-fapi")
    assert run_name("async", "normal", 1, 1, fault="none").endswith("-fnone")


def test_incomplete_work_is_included_in_deadline_denominator():
    rows = [
        {**POLLED_ROW, "polled_ready_s": "10.0"},
        {**POLLED_ROW, "polled_ready_s": "", "results": "0", "accepted": "False"},
    ]

    metrics = analyze.run_metrics(rows, protocol=3)

    assert metrics["ready_within_limit"] == 1
    assert metrics["uploads"] == 2


def test_missing_records_are_separated_by_client_acknowledgement():
    rows = [
        {
            **POLLED_ROW,
            "accepted": "False",
            "accept_s": "",
            "works": "0",
            "results": "0",
            "ready_s": "",
            "polled_ready_s": "",
        },
        {**POLLED_ROW, "works": "0", "results": "0", "ready_s": "", "polled_ready_s": ""},
    ]

    metrics = analyze.run_metrics(rows, protocol=3)

    assert metrics["unconfirmed_missing"] == 1
    assert metrics["acknowledged_missing"] == 1
    assert metrics["lost"] == 2


def test_protocol_three_requires_timely_results_for_all_uploads():
    rows = [POLLED_ROW] + [
        {**POLLED_ROW, "works": "1", "results": "0", "ready_s": "", "polled_ready_s": ""}
    ] * 9
    meta = {**ASYNC_META, "protocol": 3, "time_scale": 1.0}
    metrics = analyze.run_metrics(rows, protocol=3)

    summary = analyze.condition_summary(("async", "normal", 1, 1, "base"), [(meta, metrics)])

    assert summary["ready_within_limit_share"] == 0.1
    assert summary["meets_h1"] is False


def write_run(folder, name: str, meta: dict, rows: list[dict]) -> None:
    (folder / f"{name}.json").write_text(json.dumps(meta))
    with (folder / f"{name}.csv").open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


POLLED_ROW = {
    "first_send": "100.0",
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


RESTART = {"killed_at": 100.0, "started_at": 103.0, "ready_at": 106.0}


@pytest.mark.parametrize(
    ("first_send", "ready", "touched"),
    [
        (90.0, 5.0, False),
        (98.0, 3.0, True),
        (105.0, 1.0, True),
        (107.0, 1.0, False),
        (95.0, None, True),
    ],
)
def test_uploads_in_flight_during_a_restart_are_touched(first_send, ready, touched):
    row = {"first_send": str(first_send)}

    assert analyze.touched_by_crash(row, ready, [RESTART]) is touched


def test_crash_slice_explains_readiness_without_changing_h1(tmp_path, monkeypatch):
    runs = tmp_path / "runs"
    runs.mkdir()
    monkeypatch.setitem(analyze.PROTOCOL_DIRS, 2, tmp_path)
    calm = {**POLLED_ROW, "first_send": "90.0", "polled_ready_s": "2.0"}
    hit = {**POLLED_ROW, "first_send": "99.0", "polled_ready_s": "15.0"}
    write_run(runs, "one", {**ASYNC_META, "restarts": [RESTART]}, [calm, hit])

    [summary] = analyze.summarize(2)

    assert summary["crash_share"] == 0.5
    assert summary["restart_mean_s"] == pytest.approx(6.0)
    assert summary["ready_p95_calm_real_s"] == pytest.approx(20.0)
    assert summary["ready_p95_crash_real_s"] == pytest.approx(150.0)
    assert summary["ready_p95_real_s"] > 120
    assert summary["meets_h1"] is False


def test_restart_is_read_from_the_start_event():
    logs = "\n".join(
        [
            '{"ts": "2026-10-25T20:47:35.5+00:00", "event": "worker_started"}',
            "Traceback (most recent call last):",
            '{"ts": "2026-10-25T20:47:34+00:00", "event": "job_done"}',
            '{"ts": "2026-10-25T20:47:35+00:00", "event": "worker_started"}',
        ]
    )

    assert ready_times(logs, "worker_started") == [1792961255.0, 1792961255.5]


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
