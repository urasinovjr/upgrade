import json
from email.message import EmailMessage

import httpx
import pytest
from pydantic import ValidationError

from app.config import Settings
from app.mail.factory import make_mailer
from app.mail.mailer import MailError, SmtpMailer
from app.mail.unisender import UnisenderMailer
from tests.test_config import SAFE


def letter():
    message = EmailMessage()
    message["From"] = "UpGrade <upgrade@handmusic.space>"
    message["To"] = "owner@example.com"
    message["Subject"] = "Подтвердите почту"
    message.set_content("https://example.com/auth/confirm?token=private-token")
    return message


async def test_sends_plaintext_without_tracking(caplog):
    requests = []

    def respond(request):
        requests.append(request)
        return httpx.Response(200, json={"status": "success", "job_id": "accepted"})

    settings = Settings(mail_transport="unisender", unisender_api_key="secret-key")
    mailer = UnisenderMailer(settings, httpx.MockTransport(respond))
    await mailer.send(letter())

    request = requests[0]
    payload = json.loads(request.content)["message"]
    assert str(request.url).endswith("/email/send.json")
    assert request.headers["X-API-KEY"] == "secret-key"
    assert payload["track_links"] == payload["track_read"] == 0
    assert payload["from_email"] == "upgrade@handmusic.space"
    assert payload["from_name"] == "UpGrade"
    assert payload["recipients"] == [{"email": "owner@example.com"}]
    assert "private-token" in payload["body"]["plaintext"]
    assert "private-token" not in caplog.text
    assert "secret-key" not in caplog.text


@pytest.mark.parametrize(
    ("status", "body"),
    [(401, {}), (429, {}), (503, {}), (200, {"status": "error"}), (200, []), (200, None)],
)
async def test_refusals_are_safe_queue_failures(status, body):
    transport = httpx.MockTransport(lambda _: httpx.Response(status, json=body))
    with pytest.raises(MailError, match=r"^mail_failed$"):
        await UnisenderMailer(Settings(), transport).send(letter())


async def test_preflight_uses_ping_without_sending_mail():
    paths = []

    def respond(request):
        paths.append(request.url.path)
        return httpx.Response(200, json={"status": "success"})

    await UnisenderMailer(Settings(), httpx.MockTransport(respond)).check()
    assert paths == ["/ru/transactional/api/v1/system/ping.json"]


def test_transport_selection_and_production_validation():
    assert isinstance(make_mailer(Settings()), SmtpMailer)
    settings = Settings(**{**SAFE, "mail_transport": "unisender", "unisender_api_key": "key"})
    assert isinstance(make_mailer(settings), UnisenderMailer)
    for changes in ({"unisender_api_key": ""}, {"unisender_api_url": "http://insecure"}):
        with pytest.raises(ValidationError):
            Settings(**{**settings.model_dump(), **changes})


def test_invalid_configuration_does_not_print_credentials():
    with pytest.raises(ValidationError) as error:
        Settings(**{**SAFE, "cookie_secure": False, "unisender_api_key": "private-mail-key"})
    assert "private-mail-key" not in str(error.value)
    assert SAFE["database_url"] not in str(error.value)
