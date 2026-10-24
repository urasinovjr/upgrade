import hashlib
import io

import pytest
from PIL import Image
from sqlalchemy import select

from app.analysis.drafting import condition_images, task_input
from app.redaction import PageImage
from app.redaction.geometry import to_original, to_sanitized
from app.works.models import AnalysisRun
from app.works.review import apply_draft, initial_draft, keep_known_attachments, task_problems
from app.works.schemas import Task
from tests.fakes import FakeDraftProvider
from tests.samples import NAME_COLOR
from tests.test_analysis import run_next_job
from tests.test_redaction import has_color, masked_work, opened
from tests.works import act, save, task


def page(index: int, file_id: str) -> PageImage:
    return PageImage(
        index=index,
        file_id=file_id,
        page=1,
        content_type="image/png",
        data=b"page",
        width=10,
        height=10,
    )


def test_only_pages_of_condition_files_are_chosen():
    draft = initial_draft(
        [
            Task.model_validate(task("t1", conditionAttachmentIds=["f2"])),
            Task.model_validate(task("t2")),
        ]
    )

    chosen = condition_images(draft, [page(0, "f1"), page(1, "f2")])

    assert [(item.task_id, item.image.index) for item in chosen] == [("t1", 1)]


async def test_review_sees_clean_condition_pages_and_the_run_keeps_no_bytes(
    teacher, sessions, test_settings, storage
):
    provider = FakeDraftProvider()
    work = await masked_work(teacher)
    condition_file = work["attachments"][0]["id"]
    draft = {**work["draft"], "tasks": [task(conditionAttachmentIds=[condition_file])]}
    assert (await save(teacher, work, draft)).status_code == 200
    assert (await act(teacher, work["id"], "analyse")).status_code == 200

    await run_next_job(sessions, test_settings, storage, provider)
    [conditions] = provider.conditions
    [(pages, _)] = provider.recognized
    async with sessions() as session:
        run = await session.scalar(select(AnalysisRun))

    [sent] = conditions
    assert (sent.task_id, sent.image.file_id, sent.image.page) == ("t1", condition_file, 1)
    assert sent.image.data == pages[0].data
    assert not has_color(opened(sent.image.data), NAME_COLOR)
    assert run is not None
    assert run.input["reviewConditions"] == [
        {
            "taskId": "t1",
            "index": 0,
            "fileId": condition_file,
            "page": 1,
            "sha256": hashlib.sha256(sent.image.data).hexdigest(),
            "width": sent.image.width,
            "height": sent.image.height,
            "region": None,
        }
    ]


def test_region_maps_between_original_and_cropped_page():
    crop = {"x": 0.1, "y": 0.2, "width": 0.5, "height": 0.5}
    region = {"x": 0.2, "y": 0.3, "width": 0.1, "height": 0.2}

    inside = to_sanitized(region, crop)

    assert inside is not None
    assert to_original(inside, crop) == pytest.approx(region)
    assert to_sanitized({"x": 0.8, "y": 0.8, "width": 0.1, "height": 0.1}, crop) is None


def region_task(file_id: str = "f1") -> Task:
    area = {"fileId": file_id, "page": 1, "region": {"x": 0, "y": 0, "width": 0.5, "height": 0.5}}
    return Task.model_validate(task("t1", conditionRegion=area))


def test_condition_region_is_cut_from_the_clean_page():
    image = Image.new("RGB", (100, 100), (255, 255, 255))
    image.paste((0, 0, 0), (0, 0, 50, 50))
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    source = page(0, "f1").model_copy(
        update={"data": buffer.getvalue(), "width": 100, "height": 100}
    )
    layout = [{"id": "f1", "crops": {}}]

    [chosen] = condition_images(initial_draft([region_task()]), [source], layout)
    cut = opened(chosen.image.data)

    assert (chosen.image.width, chosen.image.height) == (50, 50)
    assert cut.convert("RGB").getpixel((25, 25)) == (0, 0, 0)
    assert task_input(region_task(), {"f1": {}}).condition_region is not None


@pytest.mark.prd(6)
def test_changed_region_makes_the_draft_stale_and_counts_as_condition():
    stored = initial_draft([region_task()])
    moved = stored.model_copy(deep=True)
    moved.tasks[0].condition_region.region.x = 0.2

    updated = apply_draft(stored, moved)
    blank = region_task().model_copy(update={"condition": "", "formula": ""})

    assert updated.input_revision == stored.input_revision + 1
    assert not any("добавьте условие" in item for item in task_problems(blank, {"f1"}))
    assert any("добавьте условие" in item for item in task_problems(blank, set()))
    assert (
        keep_known_attachments(initial_draft([region_task()]), set()).tasks[0].condition_region
        is None
    )
