from io import BytesIO

from PIL import Image, ImageDraw
from PIL.PngImagePlugin import PngInfo
from pypdf import PdfWriter

STUDENT_NAME = "Мария"
NAME_COLOR = (255, 0, 0)
INK_COLOR = (0, 0, 255)


def picture(fmt: str, **options) -> bytes:
    image = Image.new("RGB", (200, 100), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 99, 19), fill=NAME_COLOR)
    draw.rectangle((50, 50, 149, 89), fill=INK_COLOR)
    output = BytesIO()
    image.save(output, fmt, **options)
    return output.getvalue()


def png_with_text() -> bytes:
    info = PngInfo()
    info.add_text("Author", STUDENT_NAME)
    return picture("PNG", pnginfo=info)


def jpeg_with_exif() -> bytes:
    exif = Image.Exif()
    exif[0x013B] = STUDENT_NAME
    return picture("JPEG", exif=exif, quality=95)


PNG_BYTES = png_with_text()
JPEG_BYTES = jpeg_with_exif()


def pdf_bytes(pages: int = 1, password: str | None = None) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    writer.add_metadata({"/Author": STUDENT_NAME})
    if password is not None:
        writer.encrypt(password)
    output = BytesIO()
    writer.write(output)
    return output.getvalue()
