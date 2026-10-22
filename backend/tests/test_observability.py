import json
import logging
from dataclasses import replace
from decimal import Decimal
from uuid import UUID

from app.analysis.variants import get_variant
from app.observability import configure_logging, request_id_var
from app.observability.logging import JsonFormatter, TextFormatter
from app.observability.request_id import read_request_id
from tests.students import create_student
from tests.test_analysis import run_next_job, stored_runs
from tests.works import checked_work

REQUEST_ID = "check-request-0001"


def test_valid_request_id_is_kept_and_bad_one_is_replaced():
    assert read_request_id(REQUEST_ID) == REQUEST_ID
    replaced = read_request_id("bad id\nwith newline")
    assert UUID(replaced)
    assert UUID(read_request_id(None))


async def test_response_carries_the_request_id(client):
    sent = await client.get("/health", headers={"X-Request-ID": REQUEST_ID})
    made = await client.get("/health", headers={"X-Request-ID": "short"})

    assert sent.headers["x-request-id"] == REQUEST_ID
    assert UUID(made.headers["x-request-id"])


async def test_access_line_logs_the_route_template_without_query(client, caplog):
    caplog.set_level(logging.INFO, logger="api")
    work_id = "00000000-0000-0000-0000-000000000001"

    await client.get(f"/api/works/{work_id}?token=secret-value")

    [record] = [record for record in caplog.records if record.name == "api"]
    assert record.route == "/api/works/{work_id}"
    assert record.status == 401
    assert "secret-value" not in json.dumps(vars(record), default=str)
    assert work_id not in record.getMessage()


def test_logging_setup_silences_url_loggers():
    root = logging.getLogger()
    handlers = root.handlers
    try:
        configure_logging("json", "info")
        formatter = root.handlers[0].formatter
    finally:
        root.handlers = handlers

    assert logging.getLogger("httpx").level == logging.WARNING
    assert logging.getLogger("uvicorn.access").propagate is False
    assert isinstance(formatter, JsonFormatter)


def test_json_line_has_event_fields_and_request_id():
    record = logging.makeLogRecord(
        {"name": "analysis", "levelname": "INFO", "msg": "analysis_run", "run_id": "r1"}
    )
    token = request_id_var.set(REQUEST_ID)
    try:
        line = json.loads(JsonFormatter().format(record))
        text = TextFormatter().format(record)
    finally:
        request_id_var.reset(token)

    assert line["event"] == "analysis_run"
    assert line["level"] == "info"
    assert line["logger"] == "analysis"
    assert line["request_id"] == REQUEST_ID
    assert line["run_id"] == "r1"
    assert text.endswith(f"analysis_run request_id={REQUEST_ID} run_id=r1")


async def test_run_keeps_request_id_tokens_and_cost(teacher, sessions, test_settings, storage):
    variant = replace(
        get_variant("sim"), price_input_per_mtok=Decimal(3), price_output_per_mtok=Decimal(15)
    )
    work = await checked_work(teacher, await create_student(teacher))
    response = await teacher.post(
        f"/api/works/{work['id']}/actions/analyse", headers={"X-Request-ID": REQUEST_ID}
    )
    assert response.status_code == 200, response.text

    job = await run_next_job(sessions, test_settings, storage, variant=variant)
    [run] = await stored_runs(sessions, work["id"])

    assert job.payload["request_id"] == REQUEST_ID
    assert run.request_id == REQUEST_ID
    assert run.queued_ms is not None and run.queued_ms >= 0
    assert (run.input_tokens, run.output_tokens) == (2000, 400)
    assert run.cost == Decimal("0.012")
    assert run.cost_currency == "RUB"
    assert (run.variant, run.code_commit) == ("sim", "test")
