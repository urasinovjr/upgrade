from collections.abc import AsyncIterator
from email.message import EmailMessage

from app.access.oauth_client import OAuthError, OAuthProfile
from app.analysis.contract import ProviderReply, ReviewTask, TaskInput
from app.files import StorageError
from app.mail import MailError
from app.provider import ProviderError
from app.redaction import PageImage


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


class FakeOAuth:
    def __init__(self):
        self.profiles: dict[str, OAuthProfile] = {}
        self.requests: list[tuple[str, str, str, str | None]] = []

    def enabled_providers(self) -> list[str]:
        return ["yandex", "vk"]

    def authorize_url(self, provider: str, state: str, verifier: str, redirect: str) -> str:
        return f"https://{provider}.test/authorize?state={state}&redirect_uri={redirect}"

    async def fetch_profile(
        self, provider: str, code: str, verifier: str, redirect: str, device_id: str | None
    ) -> OAuthProfile:
        self.requests.append((provider, code, verifier, device_id))
        if code not in self.profiles:
            raise OAuthError(provider)
        return self.profiles[code]


def correct_task(task: ReviewTask) -> dict:
    steps = [{"id": step.id, "verdict": "correct", "explanation": ""} for step in task.steps]
    return {
        "task_id": task.id,
        "supported": True,
        "topic_id": "equations",
        "steps": steps,
        "feedback": "Решение верное.",
    }


class FakeDraftProvider:
    def __init__(
        self,
        failures: int = 0,
        invalid: int = 0,
        error: str = "provider_unavailable",
        latex: str = "x=\\pm 2",
    ):
        self.failures = failures
        self.invalid = invalid
        self.error = error
        self.latex = latex
        self.recognized: list[tuple[list[PageImage], list[TaskInput]]] = []
        self.reviewed: list[list[ReviewTask]] = []

    def reply(self, raw: dict) -> ProviderReply:
        return ProviderReply(
            raw=raw,
            provider="fake",
            model="fake-model",
            prompt_version="test-1",
            input_tokens=1000,
            output_tokens=200,
        )

    async def recognize(self, pages: list[PageImage], tasks: list[TaskInput]) -> ProviderReply:
        self.recognized.append((pages, tasks))
        if self.failures > 0:
            self.failures -= 1
            raise ProviderError(self.error)
        region = {"x": 0.1, "y": 0.5, "width": 0.8, "height": 0.2}
        steps = [{"latex": self.latex, "legible": True, "page": 0, "region": region}]
        return self.reply(
            {"tasks": [{"task_id": task.id, "matched": True, "steps": steps} for task in tasks]}
        )

    async def review(self, tasks: list[ReviewTask]) -> ProviderReply:
        self.reviewed.append(tasks)
        if self.invalid > 0:
            self.invalid -= 1
            return self.reply({"tasks": "broken"})
        return self.reply({"tasks": [correct_task(task) for task in tasks]})

    async def close(self) -> None:
        pass
