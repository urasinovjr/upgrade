from app.analysis.contract import RecognizedStep
from app.analysis.drafting import origin_of
from app.redaction import PageImage
from app.redaction.geometry import to_original
from app.works.review import apply_draft, initial_draft
from app.works.schemas import Draft, Task
from tests.fakes import FakeDraftProvider
from tests.students import create_student
from tests.test_analysis import read_work, run_next_job
from tests.works import act, checked_work, save, task

CROP = {"x": 0.2, "y": 0.5, "width": 0.5, "height": 0.5}
ORIGIN = {
    "fileId": "f1",
    "page": 1,
    "region": {"x": 0, "y": 0, "width": 1, "height": 0.2},
    "recognizedLatex": "x=1",
}
PAGES = [
    PageImage(index=0, file_id="f1", page=3, content_type="image/png", data=b"", width=1, height=1)
]


def step(**changes) -> RecognizedStep:
    region = {"x": 0.2, "y": 0.4, "width": 0.6, "height": 0.2}
    return RecognizedStep.model_validate(
        {"latex": "x=1", "legible": True, "page": 0, "region": region, **changes}
    )


def test_region_is_mapped_back_through_the_crop():
    assert to_original({"x": 0.5, "y": 0.5, "width": 0.5, "height": 0.5}, CROP) == {
        "x": 0.45,
        "y": 0.75,
        "width": 0.25,
        "height": 0.25,
    }

    origin = origin_of(step(), PAGES, {"f1": {"3": CROP}})

    assert origin is not None
    assert (origin.file_id, origin.page, origin.recognized_latex) == ("f1", 3, "x=1")
    assert origin.region.model_dump() == {"x": 0.3, "y": 0.7, "width": 0.3, "height": 0.1}


def test_bad_page_or_region_drops_only_the_link():
    outside = {"x": 0.7, "y": 0, "width": 0.5, "height": 0.1}

    assert origin_of(step(page=4), PAGES, {}) is None
    assert origin_of(step(page=None), PAGES, {}) is None
    assert origin_of(step(region=outside), PAGES, {}) is None
    assert origin_of(step(region={**outside, "x": 0, "width": 0}), PAGES, {}) is None


def linked_steps() -> list[dict]:
    return [{"id": "s1", "latex": "x=1", "verdict": "correct", "explanation": "", "origin": ORIGIN}]


def draft_with_origin() -> Draft:
    return Draft(
        revision=1,
        input_revision=0,
        analysed_input_revision=0,
        tasks=[Task.model_validate(task("t1", steps=linked_steps()))],
    )


def test_teacher_can_clear_but_not_invent_a_link():
    stored = draft_with_origin()
    original = stored.tasks[0].steps[0].origin
    moved = stored.model_copy(deep=True)
    moved.tasks[0].steps[0].origin.region.y = 0.5
    added = stored.model_copy(deep=True)
    added.tasks[0].steps.append(added.tasks[0].steps[0].model_copy(update={"id": "s2"}))
    cleared = stored.model_copy(deep=True)
    cleared.tasks[0].steps[0].origin = None

    assert apply_draft(stored, moved).tasks[0].steps[0].origin == original
    assert apply_draft(stored, added).tasks[0].steps[1].origin is None
    assert apply_draft(stored, cleared).tasks[0].steps[0].origin is None


def test_new_work_ignores_links_from_the_client():
    draft = initial_draft([Task.model_validate(task("t1", steps=linked_steps()))])

    assert draft.tasks[0].steps[0].origin is None


async def test_analysis_links_steps_to_the_original(teacher, sessions, test_settings, storage):
    work = await checked_work(teacher, await create_student(teacher))
    await act(teacher, work["id"], "analyse")
    await run_next_job(sessions, test_settings, storage, FakeDraftProvider())

    ready = await read_work(teacher, work["id"])
    [linked] = ready["draft"]["tasks"][0]["steps"]
    changed = {**linked, "origin": {**linked["origin"], "page": 9}}
    saved = await save(
        teacher,
        ready,
        {**ready["draft"], "tasks": [{**ready["draft"]["tasks"][0], "steps": [changed]}]},
    )
    after = await read_work(teacher, work["id"])

    assert linked["origin"] == {
        "fileId": work["attachments"][0]["id"],
        "page": 1,
        "region": {"x": 0.1, "y": 0.5, "width": 0.8, "height": 0.2},
        "recognizedLatex": "x=\\pm 2",
    }
    assert saved.status_code == 200, saved.text
    assert after["draft"]["tasks"][0]["steps"][0]["origin"] == linked["origin"]
