from io import BytesIO

from pypdf import PasswordType, PdfReader

JPEG = "image/jpeg"
PNG = "image/png"
PDF = "application/pdf"
SIGNATURES = (
    (b"\xff\xd8\xff", JPEG),
    (b"\x89PNG\r\n\x1a\n", PNG),
    (b"%PDF-", PDF),
)


def sniff_type(data: bytes) -> str | None:
    for signature, content_type in SIGNATURES:
        if data.startswith(signature):
            return content_type
    return None


def pdf_pages(data: bytes) -> int | None:
    try:
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted and reader.decrypt("") == PasswordType.NOT_DECRYPTED:
            return None
        pages = len(reader.pages)
    except Exception:
        return None
    return pages if pages > 0 else None
