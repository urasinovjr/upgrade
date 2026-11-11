from decimal import Decimal
from uuid import UUID

import pytest

from app.analysis.contract import Recognition
from app.analysis.pipeline import AnalysisSource, RunRecord, build_draft
from app.analysis.prompts import math_4
from app.analysis.variants import get_variant
from app.provider import ProviderError
from app.queue import Job
from app.redaction import SanitizedPages
from app.works.models import Work
from app.works.review import initial_draft
from app.works.schemas import Task
from tests.fakes import FakeDraftProvider
from tests.test_analysis import queued_work, read_work, retry_now, run_next_job, stored_runs
from tests.test_condition_images import page
from tests.works import act, task

VARIANT = get_variant("openrouter-qwen38-v2")


class QualityProvider(FakeDraftProvider):
    def __init__(self, incomplete=0, conflicts=0, timeout=False, ids=False):
        super().__init__()
        self.variant = VARIANT
        self.incomplete = incomplete
        self.conflicts = conflicts
        self.timeout = timeout
        self.ids = ids

    def reply(self, raw):
        return super().reply(raw).model_copy(update={"actual_cost_usd": Decimal("0.001")})

    async def recognize(self, pages, tasks):
        reply = await super().recognize(pages, tasks)
        for item in reply.raw["tasks"]:
            item["complete"] = self.incomplete <= 0
            item["issues"] = ["Не виден конец ответа."] if self.incomplete > 0 else []
        self.incomplete -= 1
        return reply

    async def review(self, tasks, conditions):
        reply = await super().review(tasks, conditions)
        if self.timeout and len(self.reviewed) == 2:
            raise ProviderError(
                "provider_timeout", reply.model_copy(update={"actual_cost_usd": None})
            )
        for item in reply.raw["tasks"]:
            item["gap_assessment"] = "not_evidenced"
            item["gap_reason"] = "Ошибок нет."
            if self.conflicts > 0:
                item["gap"] = {"topic_id": "equations", "reason": "Пробел без ошибки."}
            if self.ids:
                item["steps"][0]["id"] = "unknown"
        self.conflicts -= 1
        return reply


def source():
    return AnalysisSource(
        input_revision=0,
        draft=initial_draft([Task.model_validate(task("t1"))]),
        sanitized=SanitizedPages(pages=[page(0, "file")]),
        sanitize_ms=0,
        layout=[],
        last_layout=None,
    )


async def test_incomplete_recognition_retries_only_recognition(test_settings):
    provider = QualityProvider(incomplete=1)
    record = RunRecord()
    draft = await build_draft(provider, source(), test_settings, record)
    assert len(provider.recognized) == 2 and len(provider.reviewed) == 1
    assert not draft.tasks[0].quality_warnings
    assert record.input["quality"]["retry_reason"] == "incomplete_recognition"
    assert [
        item["raw"]["tasks"][0]["complete"] for item in record.input["quality"]["responses"][:2]
    ] == [False, True]
    assert record.actual_cost_usd == Decimal("0.003")


@pytest.mark.parametrize("ids", [False, True])
async def test_failed_review_retry_keeps_transcription_for_manual_check(test_settings, ids):
    provider = QualityProvider(conflicts=5, ids=ids)
    record = RunRecord()
    draft = await build_draft(provider, source(), test_settings, record)
    assert len(provider.recognized) == 1 and len(provider.reviewed) == 2
    assert draft.tasks[0].steps[0].latex == provider.latex
    assert draft.tasks[0].quality_warnings and not draft.tasks[0].reviewed
    assert draft.tasks[0].gap is None
    assert len(record.provider_calls) == 3


async def test_one_semantic_retry_is_shared_by_both_stages(test_settings):
    provider = QualityProvider(incomplete=5, conflicts=5)
    record = RunRecord()
    draft = await build_draft(provider, source(), test_settings, record)
    assert len(provider.recognized) == 2 and len(provider.reviewed) == 1
    assert draft.tasks[0].quality_warnings
    assert record.recognition["tasks"][0]["issues"] == ["Не виден конец ответа."]


def test_historical_recognition_has_unknown_completeness():
    result = Recognition.model_validate({"tasks": [{"task_id": "t", "matched": True, "steps": []}]})
    assert result.tasks[0].complete is None


def test_file_labels_are_immediately_before_each_image():
    from app.analysis.drafting import task_input

    messages = math_4.recognize_messages(
        [page(0, "a"), page(1, "b")], [task_input(source().draft.tasks[0])]
    )
    parts = messages[1]["content"]
    for index, item in enumerate(parts):
        if item["type"] == "image_url":
            assert parts[index - 1]["type"] == "text"
            assert "Страница" in parts[index - 1]["text"]
            assert "файл" in parts[index - 1]["text"]


async def test_worker_finishes_quality_failure_without_restarting_paid_chain(
    teacher, sessions, test_settings, storage
):
    queued = await queued_work(teacher)
    provider = QualityProvider(conflicts=5)
    job = await run_next_job(sessions, test_settings, storage, provider, VARIANT)
    work = await read_work(teacher, queued["id"])
    assert work["status"] == "needs_input"
    assert work["draft"]["tasks"][0]["qualityWarnings"]
    async with sessions() as session:
        assert (await session.get(Job, job.id)).status == "done"
    [run] = await stored_runs(sessions, queued["id"])
    assert len(run.provider_calls) == 3
    assert len(run.input["quality"]["responses"]) == 3
    assert run.actual_cost_usd == Decimal("0.003")
    assert (await act(teacher, queued["id"], "analyse")).json()["status"] == "needs_input"
    assert len(await stored_runs(sessions, queued["id"])) == 1
    assert (await act(teacher, queued["id"], "manual")).json()["status"] == "ready"


async def test_worker_restart_preserves_retry_limit_and_unknown_cost(
    teacher, sessions, test_settings, storage
):
    queued = await queued_work(teacher)
    provider = QualityProvider(conflicts=5, timeout=True)
    job = await run_next_job(sessions, test_settings, storage, provider, VARIANT)
    await retry_now(sessions, job)
    await run_next_job(sessions, test_settings, storage, provider, VARIANT)
    result = await read_work(teacher, queued["id"])
    [run] = await stored_runs(sessions, queued["id"])
    assert result["status"] == "needs_input"
    assert len(provider.recognized) == 1 and len(provider.reviewed) == 2
    assert len(run.provider_calls) == 3
    assert run.actual_cost_usd is None
    assert run.input["quality"]["retry_used"] is True


async def test_revision_is_checked_before_next_paid_stage(
    teacher, sessions, test_settings, storage
):
    queued = await queued_work(teacher)

    class StaleProvider(QualityProvider):
        async def recognize(self, pages, tasks):
            reply = await super().recognize(pages, tasks)
            async with sessions() as session:
                work = await session.get(Work, UUID(queued["id"]))
                work.draft = {**work.draft, "inputRevision": 9}
                await session.commit()
            return reply

    provider = StaleProvider()
    await run_next_job(sessions, test_settings, storage, provider, VARIANT)
    result = await read_work(teacher, queued["id"])
    assert result["status"] == "needs_input"
    assert result["draft"]["inputRevision"] == 9
    assert len(provider.reviewed) == 0


async def test_warning_on_one_task_keeps_other_tasks_gap(test_settings):
    class ScopedProvider(QualityProvider):
        async def recognize(self, pages, tasks):
            reply = await super().recognize(pages, tasks)
            reply.raw["tasks"][1]["complete"] = False
            reply.raw["tasks"][1]["issues"] = ["Нижняя строка не видна."]
            return reply

        async def review(self, tasks, conditions):
            reply = await super().review(tasks, conditions)
            first = reply.raw["tasks"][0]
            first["steps"][0].update(verdict="error", explanation="Потерян отрицательный корень.")
            first.update(
                gap={"topic_id": "equations", "reason": "Потерян корень."},
                gap_assessment="proposed",
                gap_reason="Ошибка при извлечении корня.",
            )
            return reply

    original = source()
    original.draft.tasks.append(Task.model_validate(task("t2")))
    draft = await build_draft(ScopedProvider(), original, test_settings, RunRecord())
    assert draft.tasks[0].gap is not None and not draft.tasks[0].quality_warnings
    assert draft.tasks[1].quality_warnings and draft.tasks[1].gap is None


def test_missing_coordinates_do_not_make_readable_text_illegible():
    from app.analysis.drafting import review_tasks

    original = source()
    original.draft.tasks[0].solution_attachment_ids = ["file"]
    recognized = Recognition.model_validate(
        {
            "tasks": [
                {
                    "task_id": "t1",
                    "matched": True,
                    "steps": [{"latex": "x=2", "legible": True, "page": None}],
                }
            ]
        }
    )
    tasks, origins = review_tasks(original.draft, recognized, original.sanitized.pages)
    assert tasks[0].steps[0].legible is True
    assert origins[tasks[0].steps[0].id] is None


def test_foreign_page_is_a_quality_failure():
    from app.analysis.contract import InvalidReply, TaskInput
    from app.analysis.quality import recognition_problem

    recognized = Recognition.model_validate(
        {
            "tasks": [
                {
                    "task_id": "t1",
                    "matched": True,
                    "complete": True,
                    "steps": [{"latex": "x=2", "legible": True, "page": 0}],
                }
            ]
        }
    )
    inputs = [
        TaskInput(
            id="t1",
            condition="",
            formula="",
            reference="",
            condition_file_ids=[],
            solution_file_ids=["other"],
        )
    ]
    with pytest.raises(InvalidReply, match="page_ids") as caught:
        recognition_problem(recognized, inputs, [page(0, "file")])
    assert caught.value.task_ids == ["t1"]


async def test_late_worker_cannot_overwrite_completed_analysis(
    teacher, sessions, test_settings, storage
):
    from app.analysis.handler import save_run
    from tests.conftest import worker_context

    queued = await queued_work(teacher)
    job = await run_next_job(sessions, test_settings, storage, QualityProvider(), VARIANT)
    [before] = await stored_runs(sessions, queued["id"])
    context = worker_context(
        sessions,
        test_settings,
        storage=storage,
        analysis_provider=QualityProvider(),
        variant=VARIANT,
    )
    await save_run(context, job, RunRecord(), None, "analysis_stale")
    [after] = await stored_runs(sessions, queued["id"])
    assert after.status == "succeeded" and after.recognition == before.recognition
    assert after.provider_calls == before.provider_calls and after.draft == before.draft


async def test_provider_schema_failure_uses_one_semantic_retry(test_settings):
    class StrictFailure(QualityProvider):
        async def recognize(self, pages, tasks):
            reply = await super().recognize(pages, tasks)
            if len(self.recognized) == 1:
                raise ProviderError("provider_invalid_response", reply)
            return reply

    provider = StrictFailure()
    record = RunRecord()
    draft = await build_draft(provider, source(), test_settings, record)
    assert not draft.tasks[0].quality_warnings
    assert len(provider.recognized) == 2 and len(provider.reviewed) == 1
    assert record.provider_calls[0]["error"] == "provider_invalid_response"
    assert record.input["quality"]["retry_reason"] == "schema"


def test_partial_recognition_keeps_readable_lines():
    from app.analysis.drafting import task_input
    from app.analysis.quality import recover_recognition

    raw = {
        "tasks": [
            {
                "task_id": "t1",
                "matched": True,
                "steps": [
                    {"latex": "x^2=4", "legible": True},
                    {"latex": "x=2"},
                    {"bad": True},
                ],
            }
        ]
    }
    parsed = recover_recognition(raw, [task_input(source().draft.tasks[0])])
    assert [step.latex for step in parsed.tasks[0].steps] == ["x^2=4", "x=2"]
    assert not parsed.tasks[0].steps[1].legible
    assert parsed.tasks[0].complete is False
