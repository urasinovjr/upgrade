import asyncio
import hashlib
import json
import threading
from dataclasses import dataclass, field
from uuid import UUID

from pydantic import BaseModel

from app.config import Settings
from app.files.keys import sanitized_key
from app.files.storage import Storage
from app.redaction.raster import JPEG, sanitized_image

RENDER_VERSION = "1"

page_slots = threading.BoundedSemaphore(2)


class PageImage(BaseModel):
    index: int
    file_id: str
    page: int
    content_type: str
    data: bytes
    width: int
    height: int


@dataclass
class SourceFile:
    file_id: str
    content_type: str
    data: bytes
    page_order: list[int]
    crops: dict = field(default_factory=dict)
    masks: dict = field(default_factory=dict)

    def crop_of(self, page: int) -> dict | None:
        return self.crops.get(str(page))

    def masks_of(self, page: int) -> list[dict]:
        return self.masks.get(str(page), [])


@dataclass
class SanitizedPages:
    pages: list[PageImage] = field(default_factory=list)
    sent: list[dict] = field(default_factory=list)


def limits_of(settings: Settings) -> tuple[int, int, int]:
    return settings.redaction_dpi, settings.redaction_max_side, settings.redaction_max_pixels


def fingerprint(source: SourceFile, page: int, settings: Settings) -> str:
    view = {
        "crop": source.crop_of(page),
        "masks": source.masks_of(page),
        "render": RENDER_VERSION,
        "limits": limits_of(settings),
    }
    return hashlib.sha256(json.dumps(view, sort_keys=True).encode()).hexdigest()[:16]


def render_page(source: SourceFile, page: int, settings: Settings) -> tuple[bytes, str, int, int]:
    with page_slots:
        return sanitized_image(
            source.data,
            source.content_type,
            page,
            source.crop_of(page),
            source.masks_of(page),
            limits_of(settings),
        )


async def sanitize_pages(
    storage: Storage,
    settings: Settings,
    teacher_id: UUID,
    work_id: UUID,
    sources: list[SourceFile],
) -> SanitizedPages:
    result = SanitizedPages()
    for source in sources:
        for page in source.page_order:
            data, kind, width, height = await asyncio.to_thread(render_page, source, page, settings)
            extension = "jpg" if kind == JPEG else "png"
            key = sanitized_key(
                teacher_id,
                work_id,
                f"{source.file_id}-{page}-{fingerprint(source, page, settings)}.{extension}",
            )
            await storage.put(key, data, kind)
            index = len(result.pages)
            result.pages.append(
                PageImage(
                    index=index,
                    file_id=source.file_id,
                    page=page,
                    content_type=kind,
                    data=data,
                    width=width,
                    height=height,
                )
            )
            result.sent.append(
                {
                    "index": index,
                    "fileId": source.file_id,
                    "page": page,
                    "key": key,
                    "sha256": hashlib.sha256(data).hexdigest(),
                    "contentType": kind,
                    "width": width,
                    "height": height,
                }
            )
    return result
