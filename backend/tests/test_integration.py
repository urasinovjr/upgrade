import socket
from email.message import EmailMessage
from uuid import uuid4

import httpx
import pytest

from app.config import Settings
from app.files import S3Storage, StorageError
from app.mail import SmtpMailer

MAILPIT_API = "http://localhost:8025/api/v1"


def reachable(port: int) -> bool:
    try:
        with socket.create_connection(("localhost", port), timeout=0.5):
            return True
    except OSError:
        return False


needs_s3 = pytest.mark.skipif(not reachable(9000), reason="S3 from docker compose is not running")
needs_mailpit = pytest.mark.skipif(not reachable(1025), reason="Mailpit is not running")


@needs_s3
async def test_s3_storage_round_trip():
    storage = await S3Storage.connect(Settings(s3_bucket="upgrade-test"))
    prefix = f"teachers/{uuid4()}/"
    try:
        await storage.put(f"{prefix}works/1/a", b"first", "image/png")
        await storage.put(f"{prefix}works/2/b", b"second", "image/png")

        chunks = [chunk async for chunk in await storage.open(f"{prefix}works/1/a")]
        deleted = await storage.delete_prefix(prefix)

        assert b"".join(chunks) == b"first"
        assert deleted == 2
        with pytest.raises(StorageError) as error:
            await storage.open(f"{prefix}works/1/a")
        assert error.value.code == "file_not_found"
    finally:
        await storage.close()


@needs_mailpit
async def test_smtp_mailer_delivers_to_mailpit():
    recipient = f"{uuid4().hex}@example.com"
    message = EmailMessage()
    message["From"] = "UpGrade <no-reply@upgrade.local>"
    message["To"] = recipient
    message["Subject"] = "Проверка"
    message.set_content("Текст письма")

    await SmtpMailer(Settings()).send(message)

    async with httpx.AsyncClient(trust_env=False) as http:
        response = await http.get(f"{MAILPIT_API}/search", params={"query": f"to:{recipient}"})
    assert response.json()["messages_count"] == 1
