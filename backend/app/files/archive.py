import io
import tarfile
from pathlib import PurePosixPath
from typing import BinaryIO

from app.files.storage import Storage

ARCHIVE_TYPE = "application/octet-stream"


class ArchiveRefused(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


async def read_object(storage: Storage, key: str) -> bytes:
    return b"".join([chunk async for chunk in await storage.open(key)])


async def export_objects(storage: Storage, target: BinaryIO) -> int:
    keys = await storage.list_keys("")
    with tarfile.open(fileobj=target, mode="w|") as archive:
        for key in keys:
            data = await read_object(storage, key)
            info = tarfile.TarInfo(key)
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))
    return len(keys)


def safe_name(name: str) -> bool:
    path = PurePosixPath(name)
    return bool(name) and not path.is_absolute() and ".." not in path.parts


async def import_objects(storage: Storage, source: BinaryIO) -> int:
    if await storage.list_keys(""):
        raise ArchiveRefused("bucket_not_empty")
    count = 0
    with tarfile.open(fileobj=source, mode="r|") as archive:
        for member in archive:
            if not member.isfile() or not safe_name(member.name):
                raise ArchiveRefused(f"unsafe_member:{member.name}")
            data = archive.extractfile(member).read()
            await storage.put(member.name, data, ARCHIVE_TYPE)
            count += 1
    return count
