import io
import tarfile
from pathlib import Path

import pytest

from app.files.archive import ArchiveRefused, export_objects, import_objects
from app.operations import migration_head, provider_problems, verify_backup
from tests.fakes import MemoryStorage
from tests.students import create_student
from tests.works import create_work


async def test_files_survive_an_export_and_import():
    source = MemoryStorage()
    await source.put("t1/w1/a.png", b"first", "image/png")
    await source.put("t1/w1/sanitized/b.png", b"second", "image/png")
    archive = io.BytesIO()

    exported = await export_objects(source, archive)
    archive.seek(0)
    target = MemoryStorage()
    imported = await import_objects(target, archive)

    assert exported == imported == 2
    assert {key: value[0] for key, value in target.objects.items()} == {
        "t1/w1/a.png": b"first",
        "t1/w1/sanitized/b.png": b"second",
    }


async def test_import_refuses_a_used_bucket_and_unsafe_names():
    used = MemoryStorage()
    await used.put("old", b"x", "text/plain")
    with pytest.raises(ArchiveRefused, match="bucket_not_empty"):
        await import_objects(used, io.BytesIO())

    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode="w") as tar:
        info = tarfile.TarInfo("../escape")
        info.size = 1
        tar.addfile(info, io.BytesIO(b"x"))
    archive.seek(0)
    with pytest.raises(ArchiveRefused, match="unsafe_member"):
        await import_objects(MemoryStorage(), archive)


async def test_backup_check_finds_missing_files(teacher, sessions, storage):
    student_id = await create_student(teacher)
    await create_work(teacher, student_id)

    async with sessions() as session:
        counts, problems = await verify_backup(session, storage)
    assert problems == []
    assert "files: 1" in counts

    storage.objects.clear()
    async with sessions() as session:
        _, problems = await verify_backup(session, storage)
    assert len(problems) == 1 and problems[0].startswith("нет файла ")


def test_latest_migration_is_known():
    files = (Path(__file__).resolve().parents[1] / "alembic" / "versions").glob("*.py")
    latest = max(path.name.split("_")[0] for path in files)

    assert migration_head() == latest


async def test_preflight_reports_an_unconfigured_provider(test_settings):
    settings = test_settings.model_copy(
        update={"analysis_variant": "yandex-qwen36-v1", "analysis_folder_id": ""}
    )

    assert (await provider_problems(settings))[0].startswith("вариант разбора не настроен")
    assert await provider_problems(test_settings) == []
