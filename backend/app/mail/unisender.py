from email.message import EmailMessage
from email.utils import parseaddr

import httpx

from app.config import Settings
from app.mail.mailer import MailError


class UnisenderMailer:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings
        self.transport = transport

    async def request(self, method: str, payload: dict) -> dict:
        settings = self.settings
        url = settings.unisender_api_url.rstrip("/") + "/" + method + ".json"
        try:
            async with httpx.AsyncClient(
                timeout=settings.unisender_timeout, transport=self.transport
            ) as client:
                response = await client.post(
                    url,
                    headers={"X-API-KEY": settings.unisender_api_key.get_secret_value()},
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise MailError("mail_failed") from error
        if not isinstance(data, dict) or data.get("status") != "success":
            raise MailError("mail_failed")
        return data

    async def check(self) -> None:
        await self.request("system/ping", {})

    async def send(self, message: EmailMessage) -> None:
        name, sender = parseaddr(str(message["From"]))
        _, recipient = parseaddr(str(message["To"]))
        body = message.get_body(preferencelist=("plain",))
        if not sender or not recipient or body is None:
            raise MailError("mail_failed")
        await self.request(
            "email/send",
            {
                "message": {
                    "from_email": sender,
                    "from_name": name,
                    "recipients": [{"email": recipient}],
                    "subject": str(message["Subject"]),
                    "body": {"plaintext": body.get_content()},
                    "track_links": 0,
                    "track_read": 0,
                }
            },
        )
