import hashlib
from io import BytesIO

import pytest
from PIL import Image
from sqlalchemy import select

from app.queue import Job
from app.redaction import PageUnreadable
from app.redaction.raster import sanitized_image
from app.works.models import AnalysisRun
from tests.fakes import FakeDraftProvider
from tests.samples import (
    INK_COLOR,
    JPEG_BYTES,
    NAME_COLOR,
    PNG_BYTES,
    STUDENT_NAME,
    pdf_bytes,
    picture,
)
from tests.students import create_student
from tests.test_analysis import read_work, run_next_job
from tests.works import act, check_all_pages, create_work, layout_of, put_layout

LIMITS = (150, 2000, 40_000_000)
NAME_MASK = {"x": 0, "y": 0, "width": 0.5, "height": 0.2}
NAME_BYTES = STUDENT_NAME.encode()


def opened(data: bytes) -> Image.Image:
    return Image.open(BytesIO(data))


def near(pixel: tuple, color: tuple, tolerance: int = 60) -> bool:
    return all(abs(left - right) <= tolerance for left, right in zip(pixel, color, strict=True))


def has_color(image: Image.Image, color: tuple) -> bool:
    return any(near(pixel, color) for pixel in image.convert("RGB").get_flattened_data())


def test_metadata_is_dropped_from_photos_and_scans():
    png, png_type, _, _ = sanitized_image(PNG_BYTES, "image/png", 1, None, [], LIMITS)
    jpeg, jpeg_type, _, _ = sanitized_image(JPEG_BYTES, "image/jpeg", 1, None, [], LIMITS)
    scan, scan_type, width, _ = sanitized_image(pdf_bytes(), "application/pdf", 1, None, [], LIMITS)

    assert NAME_BYTES not in png and "Author" not in opened(png).info
    assert NAME_BYTES not in jpeg and len(opened(jpeg).getexif()) == 0
    assert NAME_BYTES not in scan and b"Author" not in scan
    assert (png_type, jpeg_type, scan_type) == ("image/png", "image/jpeg", "image/png")
    assert width == round(200 * 150 / 72)


def test_mask_paints_the_name_black():
    data, _, width, height = sanitized_image(PNG_BYTES, "image/png", 1, None, [NAME_MASK], LIMITS)
    image = opened(data).convert("RGB")

    assert (width, height) == (200, 100)
    assert not has_color(image, NAME_COLOR)
    assert image.getpixel((0, 0)) == (0, 0, 0)
    assert image.getpixel((99, 19)) == (0, 0, 0)
    assert has_color(image, INK_COLOR)


def test_crop_leaves_only_the_selected_area():
    crop = {"x": 0.25, "y": 0.5, "width": 0.75, "height": 0.5}

    data, _, width, height = sanitized_image(PNG_BYTES, "image/png", 1, crop, [], LIMITS)

    assert (width, height) == (150, 50)
    assert not has_color(opened(data), NAME_COLOR)


def test_mask_follows_the_orientation_shown_to_the_teacher():
    exif = Image.Exif()
    exif[0x0112] = 6
    rotated = picture("JPEG", exif=exif, quality=95)
    mask = {"x": 0.8, "y": 0, "width": 0.2, "height": 0.5}

    data, _, width, height = sanitized_image(rotated, "image/jpeg", 1, None, [mask], LIMITS)

    assert (width, height) == (100, 200)
    assert not has_color(opened(data), NAME_COLOR)


def test_large_or_broken_pages_are_rejected():
    with pytest.raises(PageUnreadable, match="page_unreadable"):
        sanitized_image(b"\x89PNG\r\n\x1a\n" + b"\x00" * 32, "image/png", 1, None, [], LIMITS)
    with pytest.raises(PageUnreadable, match="page_too_large"):
        sanitized_image(PNG_BYTES, "image/png", 1, None, [], (150, 2000, 100))


async def masked_work(teacher) -> dict:
    student_id = await create_student(teacher)
    files = [(f"{STUDENT_NAME}_контрольная.jpg", JPEG_BYTES), ("scan.pdf", pdf_bytes(2))]
    work = await create_work(teacher, student_id, files=files)
    layout = layout_of(work)
    layout[0]["masks"] = {"1": [NAME_MASK]}
    layout[1]["pageOrder"] = [2]
    response = await put_layout(teacher, work, layout)
    assert response.status_code == 200, response.text
    return await check_all_pages(teacher, response.json())


async def test_provider_receives_only_clean_copies(teacher, sessions, test_settings, storage):
    provider = FakeDraftProvider()
    work = await masked_work(teacher)
    assert (await act(teacher, work["id"], "analyse")).status_code == 200

    await run_next_job(sessions, test_settings, storage, provider)
    [(pages, tasks)] = provider.recognized
    async with sessions() as session:
        run = await session.scalar(select(AnalysisRun))
    described = str([page.model_dump(exclude={"data"}) for page in pages]) + str(tasks)

    assert [(page.index, page.page) for page in pages] == [(0, 1), (1, 2)]
    assert [page.file_id for page in pages] == [item["id"] for item in work["attachments"]]
    assert all(NAME_BYTES not in page.data for page in pages)
    assert not has_color(opened(pages[0].data), NAME_COLOR)
    assert STUDENT_NAME not in described and "контрольная" not in described
    assert "Контрольная 1" not in described
    assert run is not None and run.sanitize_ms is not None
    assert [item["page"] for item in run.sent_pages] == [1, 2]
    original = next(key for key in storage.objects if key.endswith(pages[0].file_id))
    folder = original.removesuffix(pages[0].file_id) + "sanitized/"
    for page, sent in zip(pages, run.sent_pages, strict=True):
        assert storage.objects[sent["key"]][0] == page.data
        assert sent["sha256"] == hashlib.sha256(page.data).hexdigest()
        assert sent["key"].startswith(folder)


async def test_unreadable_page_fails_without_retries(teacher, sessions, test_settings, storage):
    student_id = await create_student(teacher)
    broken = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
    work = await check_all_pages(
        teacher, await create_work(teacher, student_id, files=[("photo.png", broken)])
    )
    await act(teacher, work["id"], "analyse")

    job = await run_next_job(sessions, test_settings, storage)
    async with sessions() as session:
        stored = await session.get(Job, job.id)

    assert stored is not None and (stored.status, stored.last_error) == (
        "failed",
        "page_unreadable",
    )
    assert (await read_work(teacher, work["id"]))["status"] == "failed"


async def test_teacher_sees_the_pages_sent_to_the_provider(
    teacher, sessions, test_settings, storage
):
    work = await masked_work(teacher)
    before = await teacher.get(f"/api/works/{work['id']}/analysis/pages")
    await act(teacher, work["id"], "analyse")
    await run_next_job(sessions, test_settings, storage)

    listed = (await teacher.get(f"/api/works/{work['id']}/analysis/pages")).json()
    first = await teacher.get(f"/api/works/{work['id']}/analysis/pages/0")
    missing = await teacher.get(f"/api/works/{work['id']}/analysis/pages/5")

    assert before.json() == []
    assert [(page["index"], page["page"], page["contentType"]) for page in listed] == [
        (0, 1, "image/jpeg"),
        (1, 2, "image/png"),
    ]
    assert "key" not in listed[0]
    assert first.headers["content-type"] == "image/jpeg"
    assert hashlib.sha256(first.content).hexdigest() == listed[0]["sha256"]
    assert not has_color(opened(first.content), NAME_COLOR)
    assert missing.status_code == 404
