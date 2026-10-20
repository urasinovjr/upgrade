from io import BytesIO

from pypdf import PdfWriter

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 32


def pdf_bytes(pages: int = 1, password: str | None = None) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    if password is not None:
        writer.encrypt(password)
    output = BytesIO()
    writer.write(output)
    return output.getvalue()
