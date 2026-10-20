from collections.abc import AsyncIterator
from email.message import EmailMessage

from app.files import StorageError
from app.mail import MailError


class MemoryStorage:
    def __init__(self, failures: int = 0):
        self.objects: dict[str, tuple[bytes, str]] = {}
        self.failures = failures

    def check_failure(self) -> None:
        if self.failures > 0:
            self.failures -= 1
            raise StorageError("storage_unavailable")

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        self.check_failure()
        self.objects[key] = (data, content_type)

    async def open(self, key: str) -> AsyncIterator[bytes]:
        self.check_failure()
        if key not in self.objects:
            raise StorageError("file_not_found")
        return self.chunks(self.objects[key][0])

    async def chunks(self, data: bytes) -> AsyncIterator[bytes]:
        yield data

    async def delete_prefix(self, prefix: str) -> int:
        self.check_failure()
        keys = [key for key in self.objects if key.startswith(prefix)]
        for key in keys:
            del self.objects[key]
        return len(keys)

    async def close(self) -> None:
        pass


class MemoryMailer:
    def __init__(self, failures: int = 0):
        self.sent: list[EmailMessage] = []
        self.failures = failures

    async def send(self, message: EmailMessage) -> None:
        if self.failures > 0:
            self.failures -= 1
            raise MailError("mail_failed")
        self.sent.append(message)
