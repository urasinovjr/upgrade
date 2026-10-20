from uuid import uuid4

from app.files import (
    JPEG,
    PDF,
    PNG,
    enqueue_file_cleanup,
    file_key,
    pdf_pages,
    sniff_type,
    work_prefix,
)
from app.queue import Job, claim_job
from app.worker import handle_job
from tests.conftest import worker_context
from tests.fakes import MemoryStorage
from tests.samples import JPEG_BYTES, PNG_BYTES, pdf_bytes


def test_type_comes_from_file_signature():
    assert sniff_type(JPEG_BYTES) == JPEG
    assert sniff_type(PNG_BYTES) == PNG
    assert sniff_type(pdf_bytes()) == PDF
    assert sniff_type(b"GIF89a") is None
    assert sniff_type(b"") is None


def test_pdf_pages_are_counted():
    assert pdf_pages(pdf_bytes(3)) == 3


def test_broken_pdf_has_no_pages():
    assert pdf_pages(b"%PDF-1.7 broken") is None


def test_pdf_with_empty_password_is_read():
    assert pdf_pages(pdf_bytes(2, password="")) == 2


def test_pdf_with_real_password_is_unreadable():
    assert pdf_pages(pdf_bytes(2, password="secret")) is None


def test_file_keys_share_work_prefix():
    teacher, work, file = uuid4(), uuid4(), uuid4()

    assert file_key(teacher, work, file).startswith(work_prefix(teacher, work))
    assert str(teacher) in work_prefix(teacher, work)


async def queued_cleanup(sessions, prefixes: list[str], attempts: int = 3) -> Job:
    async with sessions() as session:
        await enqueue_file_cleanup(session, uuid4(), prefixes, attempts)
        await session.commit()
    async with sessions() as session:
        return await claim_job(session, lease_seconds=5)


async def test_cleanup_deletes_only_given_prefix(sessions, test_settings):
    storage = MemoryStorage()
    await storage.put("teachers/a/works/1/x", b"1", PNG)
    await storage.put("teachers/a/works/2/y", b"2", PNG)
    job = await queued_cleanup(sessions, ["teachers/a/works/1/"])

    await handle_job(worker_context(sessions, test_settings, storage=storage), job)

    assert list(storage.objects) == ["teachers/a/works/2/y"]
    async with sessions() as session:
        assert (await session.get(Job, job.id)).status == "done"


async def test_cleanup_retries_when_storage_is_down(sessions, test_settings):
    storage = MemoryStorage(failures=1)
    storage.objects["teachers/a/works/1/x"] = (b"1", PNG)
    job = await queued_cleanup(sessions, ["teachers/a/works/1/"])

    await handle_job(worker_context(sessions, test_settings, storage=storage), job)

    async with sessions() as session:
        stored = await session.get(Job, job.id)
    assert stored.status == "retrying"
    assert stored.last_error == "storage_unavailable"
    assert "teachers/a/works/1/x" in storage.objects
