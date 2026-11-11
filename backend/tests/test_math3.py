from dataclasses import replace

from app.analysis.contract import ReviewTask, StepInput
from app.analysis.drafting import merge_review, review_tasks, tasks_to_recognize
from app.analysis.pipeline import AnalysisSource, RunRecord, build_draft
from app.analysis.prompts import math_3
from app.analysis.variants import get_variant
from app.homework.exams import exam_catalog
from app.redaction import SanitizedPages
from app.works.review import initial_draft
from app.works.schemas import Task
from tests.conftest import FakeProvider, make_client
from tests.fakes import FakeDraftProvider
from tests.test_condition_images import page
from tests.works import task


class MathProvider(FakeDraftProvider):
    def __init__(self):
        super().__init__()
        self.variant = replace(get_variant("yandex-qwen36-v3"), name="test")


async def test_review_receives_solution_and_condition_images_with_transcription(test_settings):
    draft = initial_draft(
        [
            Task.model_validate(
                task(
                    "t1",
                    condition="Докажите равенство углов.",
                    conditionAttachmentIds=["condition"],
                    solutionAttachmentIds=["solution"],
                )
            ),
        ]
    )
    provider = MathProvider()
    record = RunRecord()
    source = AnalysisSource(
        input_revision=0,
        draft=draft,
        sanitized=SanitizedPages(pages=[page(0, "condition"), page(1, "solution")]),
        sanitize_ms=0,
        layout=[],
        last_layout=[],
    )
    await build_draft(provider, source, test_settings, record)
    images = provider.conditions[0]
    assert {(image.kind, image.image.file_id) for image in images} == {
        ("condition", "condition"),
        ("solution", "solution"),
    }
    assert record.input["review"][0]["steps"]
    assert "решения" in math_3.RECOGNIZE_SYSTEM
    messages = math_3.review_messages(provider.reviewed[0], images)
    assert "Внешний вид рисунка" in messages[0]["content"]
    assert sum(item["type"] == "image_url" for item in messages[1]["content"]) == 2


def test_missing_solution_cannot_generate_gap_or_recognition():
    from app.analysis.contract import read_review

    draft = initial_draft([Task.model_validate(task("t1", steps=[], solutionAttachmentIds=[]))])
    assert tasks_to_recognize(draft, [], None) == []
    targets, origins = review_tasks(draft, None)
    review = read_review(
        {
            "tasks": [
                {
                    "task_id": "t1",
                    "supported": True,
                    "topic_id": "fractions",
                    "steps": [],
                    "gap": {"topic_id": "fractions", "reason": "Нет фото"},
                }
            ]
        },
        targets,
    )
    merged = merge_review(draft, targets, review, origins)
    assert merged.tasks[0].gap is None
    assert merged.tasks[0].feedback == "Решение не прислано"
    assert merged.tasks[0].result == "needs_clarification"


def test_recognition_preserves_mapping_and_all_exam_positions():
    data = ReviewTask(
        id="t1",
        condition="",
        formula="",
        reference="",
        condition_file_ids=[],
        solution_file_ids=["f2"],
        steps=[StepInput(id="s1", latex="По теореме Пифагора", legible=True)],
    )
    messages = math_3.recognize_messages([page(0, "f1"), page(1, "f2")], [data])
    assert '"solution_file_ids": ["f2"]' in str(messages)
    catalogs = exam_catalog()
    counts = {
        (item["year"], item["exam"], item["level"]): len(item["positions"]) for item in catalogs
    }
    assert counts == {
        (2026, "oge", None): 25,
        (2027, "oge", None): 25,
        (2026, "ege", "basic"): 21,
        (2027, "ege", "basic"): 21,
        (2026, "ege", "profile"): 19,
        (2027, "ege", "profile"): 20,
    }
    for catalog in catalogs:
        assert [item["position"] for item in catalog["positions"]] == list(
            range(1, len(catalog["positions"]) + 1)
        )


def test_step_on_another_tasks_image_requires_clarification():
    from app.analysis.contract import Recognition

    draft = initial_draft([Task.model_validate(task("t1", steps=[], solutionAttachmentIds=["f2"]))])
    recognition = Recognition.model_validate(
        {
            "tasks": [
                {
                    "task_id": "t1",
                    "matched": True,
                    "steps": [{"latex": "AB=AC", "legible": True, "page": 0}],
                }
            ]
        }
    )
    targets, _ = review_tasks(draft, recognition, [page(0, "f1"), page(1, "f2")])
    assert targets[0].steps[0].legible is False


async def test_production_homework_is_closed_without_internal_flag(test_settings):
    settings = test_settings.model_copy(
        update={"app_env": "production", "homework_internal_test": False}
    )
    async for client in make_client(settings, FakeProvider()):
        assert (await client.get("/api/homework")).status_code == 404
    settings = settings.model_copy(update={"homework_internal_test": True})
    async for client in make_client(settings, FakeProvider()):
        assert (await client.get("/api/homework")).status_code == 401
