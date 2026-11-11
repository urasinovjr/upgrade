import runpy
from decimal import Decimal
from uuid import UUID

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import text

from app.analysis.contract import ProviderReply
from app.analysis.variants import get_variant
from app.homework.models import HomeworkJob
from app.provider import ProviderError
from tests.conftest import ROOT
from tests.fakes import FakeDraftProvider
from tests.homework import create_homework
from tests.test_analysis import queued_work, run_next_job, stored_runs
from tests.test_homework_jobs import (
    HomeworkProvider,
    checked_condition,
    recognize,
    run_job,
    upload_condition,
)


def with_metadata(reply, generation="gen-1", cost=Decimal("0.001")):
    return reply.model_copy(
        update={
            "generation_id": generation,
            "actual_provider": "Nebius",
            "returned_model": "qwen/qwen3.8-27b",
            "actual_cost_usd": cost,
            "processing": {"reasoning": {"exclude": True}},
        }
    )


class JournalProvider(FakeDraftProvider):
    async def recognize(self, pages, tasks):
        return with_metadata(await super().recognize(pages, tasks))

    async def review(self, tasks, conditions):
        return with_metadata(await super().review(tasks, conditions), "gen-2", Decimal("0.002"))


async def test_analysis_keeps_calls_and_actual_cost_separate_from_estimate(
    teacher, sessions, test_settings, storage
):
    queued = await queued_work(teacher)
    await run_next_job(
        sessions, test_settings, storage, JournalProvider(), get_variant("openrouter-qwen38-v1")
    )
    [run] = await stored_runs(sessions, queued["id"])
    assert run.actual_cost_usd == Decimal("0.003")
    assert [call["generation_id"] for call in run.provider_calls] == ["gen-1", "gen-2"]
    assert [call["actual_cost_usd"] for call in run.provider_calls] == ["0.001", "0.002"]
    result = (await teacher.get(f"/api/works/{queued['id']}")).text
    assert "gen-1" not in result and "actual_cost_usd" not in result


async def test_failed_second_call_preserves_first_call_and_its_cost(
    teacher, sessions, test_settings, storage
):
    class FailingProvider(JournalProvider):
        async def review(self, tasks, conditions):
            reply = ProviderReply(
                raw={}, provider="openrouter", model="qwen/qwen3.8-27b", prompt_version="math-3"
            )
            raise ProviderError(
                "provider_budget_exhausted", with_metadata(reply, "gen-failed", None)
            )

    queued = await queued_work(teacher)
    await run_next_job(sessions, test_settings, storage, FailingProvider())
    [run] = await stored_runs(sessions, queued["id"])
    assert run.error == "provider_budget_exhausted" and run.actual_cost_usd is None
    assert run.provider_calls[0]["actual_cost_usd"] == "0.001"
    assert run.provider_calls[1]["actual_cost_usd"] is None


@pytest.mark.parametrize("failure", [False, True])
async def test_homework_provenance_keeps_generation_on_success_and_final_error(
    teacher, sessions, test_settings, storage, failure
):
    class TrackedProvider(HomeworkProvider):
        async def recognize_conditions(self, text, pages):
            reply = with_metadata(await super().recognize_conditions(text, pages))
            if failure:
                raise ProviderError("provider_auth", reply)
            return reply

    homework = await checked_condition(
        teacher, await upload_condition(teacher, await create_homework(teacher))
    )
    queued = (await recognize(teacher, homework)).json()
    await run_job(sessions, test_settings, storage, TrackedProvider())
    async with sessions() as session:
        stored = await session.get(HomeworkJob, UUID(queued["id"]))
        assert stored.status == ("failed" if failure else "ready")
        [call] = stored.provenance["providerCalls"]
        assert call["generation_id"] == "gen-1"
        assert call["actual_cost_usd"] == "0.001"
        assert call["error"] == ("provider_auth" if failure else None)


async def test_additive_migration_preserves_existing_analysis(
    teacher, sessions, engine, test_settings, storage
):
    queued = await queued_work(teacher)
    await run_next_job(sessions, test_settings, storage)
    [before] = await stored_runs(sessions, queued["id"])
    migration = runpy.run_path(str(ROOT / "alembic/versions/0020_provider_calls.py"))

    def migrate(connection):
        with Operations.context(MigrationContext.configure(connection)):
            migration["downgrade"]()
            migration["upgrade"]()

    async with engine.begin() as connection:
        await connection.run_sync(migrate)
        record = (
            await connection.execute(
                text("SELECT provider_calls, actual_cost_usd FROM analysis_runs")
            )
        ).one()
        assert record.provider_calls == [] and record.actual_cost_usd is None
    [after] = await stored_runs(sessions, queued["id"])
    assert after.id == before.id and after.draft == before.draft
    assert after.recognition == before.recognition and after.review == before.review
