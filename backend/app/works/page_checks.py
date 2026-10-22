from app.works.models import WorkFile
from app.works.schemas import AttachmentLayout

MAX_MASKS_PER_PAGE = 20


def page_keys_valid(keys, pages: int) -> bool:
    return all(key.isdigit() and 1 <= int(key) <= pages for key in keys)


def valid_masks(item: AttachmentLayout, pages: int) -> bool:
    if not page_keys_valid(item.masks, pages):
        return False
    return all(len(rects) <= MAX_MASKS_PER_PAGE for rects in item.masks.values())


def stored_masks(item: AttachmentLayout) -> dict:
    return {
        page: [rect.model_dump() for rect in rects] for page, rects in item.masks.items() if rects
    }


def stored_crops(item: AttachmentLayout) -> dict:
    return {page: crop.model_dump() for page, crop in item.crops.items()}


def page_state(crops: dict, masks: dict, page: int) -> tuple:
    return crops.get(str(page)), masks.get(str(page), [])


def kept_checks(file: WorkFile, crops: dict, masks: dict, proposed: list[int]) -> list[int]:
    return sorted(
        page
        for page in set(proposed)
        if 1 <= page <= file.pages
        and page_state(file.crops, file.masks, page) == page_state(crops, masks, page)
    )


def unchecked_pages(files: list[WorkFile]) -> list[dict]:
    return [
        {"fileId": str(file.id), "page": page}
        for file in files
        for page in file.page_order
        if page not in file.checked_pages
    ]
