from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.analysis.report import spread
from app.cli import run
from app.queue import Job
from app.works.models import AnalysisRun
from tests.students import create_student
from tests.works import create_work


def test_spread_handles_one_and_many_values():
    assert spread([]) is None
    single = spread([40])
    assert single is not None and (single.p50, single.p95) == (40, 40)
    many = spread([float(value) for value in range(1, 101)])
    assert many is not None and many.count == 100
    assert round(many.p50, 2) == 50.5 and round(many.p95, 2) == 95.05


async def add_runs(sessions, work_id: str) -> None:
    async with sessions() as session:
        job = Job(kind="work_analysis", subject_id=work_id, max_attempts=5, status="done")
        session.add(job)
        await session.flush()
        for index, error in enumerate([None, "provider_invalid_response"]):
            session.add(
                AnalysisRun(
                    work_id=work_id,
                    job_id=job.id,
                    input_revision=0,
                    recognized=True,
                    status="failed" if error else "succeeded",
                    error=error,
                    provider="fake",
                    model="fake-model",
                    prompt_version="test-1",
                    input={"tasks": [{"id": "t1"}, {"id": "t2"}]},
                    recognize_ms=100 * (index + 1),
                    review_ms=50,
                    queued_ms=10,
                    request_id=f"request-{uuid4()}",
                    input_tokens=1000,
                    output_tokens=100,
                    cost=Decimal("0.004"),
                    cost_currency="USD",
                )
            )
        await session.commit()


async def test_report_summarises_runs_and_exports_csv(teacher, sessions, test_settings):
    work = await create_work(teacher, await create_student(teacher))
    await add_runs(sessions, work["id"])

    text = await run(["analysis-report"], test_settings)
    table = await run(["analysis-report", "--csv"], test_settings)
    empty = await run(["analysis-report", "--until", date(2000, 1, 1).isoformat()], test_settings)

    assert "runs 2" in text
    assert "run status: failed 1, succeeded 1" in text
    assert "run errors: provider_invalid_response 1" in text
    assert "recognize 2 150 195" in text
    assert "cost total 0.008000 USD" in text
    assert "cost per task: n=2 p50=0.002000 p95=0.002000" in text
    assert table.splitlines()[0].startswith("run_id,work_id,created_at,status")
    assert len(table.splitlines()) == 3
    assert empty == "нет данных"
