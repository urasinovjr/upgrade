import hashlib

from sqlalchemy import select

from app.analysis.drafting import condition_images
from app.redaction import PageImage
from app.works.models import AnalysisRun
from app.works.review import initial_draft
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
        }
    ]
