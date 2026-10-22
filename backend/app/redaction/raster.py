import io
import math
import threading

import pypdfium2 as pdfium
from PIL import Image, ImageDraw, ImageOps

PDF = "application/pdf"
JPEG = "image/jpeg"
PNG = "image/png"
POINTS_PER_INCH = 72

pdf_lock = threading.Lock()


class PageUnreadable(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def pdf_scale(page: pdfium.PdfPage, dpi: int, max_pixels: int) -> float:
    width, height = page.get_size()
    wanted = dpi / POINTS_PER_INCH
    allowed = math.sqrt(max_pixels / max(1.0, width * height))
    return min(wanted, allowed)


def render_pdf_page(data: bytes, page: int, dpi: int, max_pixels: int) -> Image.Image:
    with pdf_lock:
        document = pdfium.PdfDocument(data)
        try:
            pdf_page = document[page - 1]
            bitmap = pdf_page.render(scale=pdf_scale(pdf_page, dpi, max_pixels))
            return bitmap.to_pil().convert("RGB")
        finally:
            document.close()


def open_photo(data: bytes, max_pixels: int) -> Image.Image:
    image = Image.open(io.BytesIO(data))
    if image.width * image.height > max_pixels:
        raise PageUnreadable("page_too_large")
    return ImageOps.exif_transpose(image).convert("RGB")


def load_page(data: bytes, content_type: str, page: int, dpi: int, max_pixels: int):
    try:
        if content_type == PDF:
            return render_pdf_page(data, page, dpi, max_pixels)
        return open_photo(data, max_pixels)
    except PageUnreadable:
        raise
    except (OSError, ValueError, IndexError, pdfium.PdfiumError) as error:
        raise PageUnreadable("page_unreadable") from error


def pixel_box(rect: dict, width: int, height: int) -> tuple[int, int, int, int]:
    left = max(0, math.floor(rect["x"] * width))
    top = max(0, math.floor(rect["y"] * height))
    right = min(width, math.ceil((rect["x"] + rect["width"]) * width))
    bottom = min(height, math.ceil((rect["y"] + rect["height"]) * height))
    return left, top, max(left + 1, right), max(top + 1, bottom)


def redact(image: Image.Image, crop: dict | None, masks: list[dict]) -> Image.Image:
    draw = ImageDraw.Draw(image)
    for mask in masks:
        left, top, right, bottom = pixel_box(mask, image.width, image.height)
        draw.rectangle((left, top, right - 1, bottom - 1), fill=(0, 0, 0))
    if crop is not None:
        image = image.crop(pixel_box(crop, image.width, image.height))
    return image


def encode(image: Image.Image, content_type: str) -> bytes:
    clean = Image.new("RGB", image.size)
    clean.paste(image)
    buffer = io.BytesIO()
    if content_type == JPEG:
        clean.save(buffer, "JPEG", quality=90)
    else:
        clean.save(buffer, "PNG")
    return buffer.getvalue()


def output_type(content_type: str) -> str:
    return JPEG if content_type == JPEG else PNG


def sanitized_image(
    data: bytes,
    content_type: str,
    page: int,
    crop: dict | None,
    masks: list[dict],
    limits: tuple[int, int, int],
) -> tuple[bytes, str, int, int]:
    dpi, max_side, max_pixels = limits
    image = redact(load_page(data, content_type, page, dpi, max_pixels), crop, masks)
    image.thumbnail((max_side, max_side))
    kind = output_type(content_type)
    return encode(image, kind), kind, image.width, image.height
