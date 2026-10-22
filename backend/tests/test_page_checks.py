from app.works.models import WorkFile
from app.works.page_checks import kept_checks, unchecked_pages
from tests.samples import PNG_BYTES, pdf_bytes
from tests.students import create_student
from tests.works import act, create_work, layout_of, put_layout

MASK = {"x": 0.1, "y": 0.05, "width": 0.3, "height": 0.1}
CROP = {"x": 0, "y": 0.2, "width": 1, "height": 0.8}


def stored_file(**changes) -> WorkFile:
    values = {"pages": 3, "page_order": [1, 2, 3], "crops": {}, "masks": {}, "checked_pages": []}
    return WorkFile(**{**values, **changes})


def test_check_is_kept_only_for_pages_whose_view_did_not_change():
    file = stored_file(masks={"2": [MASK]})

    assert kept_checks(file, {}, {"2": [MASK]}, [1, 2, 2, 9]) == [1, 2]
    assert kept_checks(file, {}, {}, [1, 2]) == [1]
    assert kept_checks(file, {"1": CROP}, {"2": [MASK]}, [1, 2]) == [2]


def test_only_pages_sent_to_the_provider_need_a_check():
    file = stored_file(page_order=[3, 1], checked_pages=[1])

    assert unchecked_pages([file]) == [{"fileId": str(file.id), "page": 3}]


async def pdf_work(teacher) -> dict:
    student_id = await create_student(teacher)
    files = [("scan.pdf", pdf_bytes(2)), ("photo.png", PNG_BYTES)]
    return await create_work(teacher, student_id, files=files)


async def test_marking_pages_does_not_change_the_draft(teacher):
    work = await pdf_work(teacher)

    response = await put_layout(teacher, work, layout_of(work, checkedPages=[1, 2]))
    body = response.json()

    assert response.status_code == 200, response.text
    assert [item["checkedPages"] for item in body["attachments"]] == [[1, 2], [1]]
    assert body["draft"]["revision"] == work["draft"]["revision"]
    assert body["draft"]["inputRevision"] == work["draft"]["inputRevision"]


async def test_new_mask_resets_its_page_and_marks_inputs_changed(teacher):
    work = await pdf_work(teacher)
    checked = (await put_layout(teacher, work, layout_of(work, checkedPages=[1, 2]))).json()
    layout = layout_of(checked)
    layout[0]["masks"] = {"2": [MASK]}

    masked = (await put_layout(teacher, checked, layout)).json()
    pdf = masked["attachments"][0]

    assert pdf["masks"] == {"2": [MASK]}
    assert pdf["checkedPages"] == [1]
    assert masked["attachments"][1]["checkedPages"] == [1]
    assert masked["draft"]["inputRevision"] == checked["draft"]["inputRevision"] + 1


async def test_reordering_pages_keeps_their_checks(teacher):
    work = await pdf_work(teacher)
    checked = (await put_layout(teacher, work, layout_of(work, checkedPages=[1, 2]))).json()
    layout = layout_of(checked)
    layout[0]["pageOrder"] = [2, 1]

    reordered = (await put_layout(teacher, checked, layout)).json()

    assert reordered["attachments"][0]["checkedPages"] == [1, 2]
    assert reordered["draft"]["inputRevision"] == checked["draft"]["inputRevision"] + 1


async def test_analysis_waits_for_every_sent_page(teacher):
    work = await pdf_work(teacher)
    layout = layout_of(work)
    layout[0]["checkedPages"] = [1]
    layout[1]["checkedPages"] = [1]
    await put_layout(teacher, work, layout)

    blocked = await act(teacher, work["id"], "analyse")
    layout[0]["pageOrder"] = [1]
    await put_layout(teacher, work, layout)
    started = await act(teacher, work["id"], "analyse")

    assert blocked.status_code == 409
    assert blocked.json() == {
        "detail": "redaction_unchecked",
        "pages": [{"fileId": work["attachments"][0]["id"], "page": 2}],
    }
    assert started.status_code == 200, started.text


async def test_invalid_masks_are_rejected(teacher):
    work = await pdf_work(teacher)
    too_many = layout_of(work)
    too_many[0]["masks"] = {"1": [MASK] * 21}
    wrong_page = layout_of(work)
    wrong_page[0]["masks"] = {"3": [MASK]}
    outside = layout_of(work)
    outside[0]["masks"] = {"1": [{**MASK, "x": 1.5}]}

    responses = [await put_layout(teacher, work, layout) for layout in (too_many, wrong_page)]
    invalid = await put_layout(teacher, work, outside)

    assert [response.json() for response in responses] == [{"detail": "attachments_mismatch"}] * 2
    assert invalid.status_code == 422
