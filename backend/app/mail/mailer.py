from email.message import EmailMessage
from typing import Protocol

import aiosmtplib

from app.config import Settings


class MailError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class Mailer(Protocol):
    async def send(self, message: EmailMessage) -> None: ...


class SmtpMailer:
    def __init__(self, settings: Settings):
        self.settings = settings

    async def send(self, message: EmailMessage) -> None:
        settings = self.settings
        try:
            await aiosmtplib.send(
                message,
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                username=settings.smtp_user or None,
                password=settings.smtp_password.get_secret_value() or None,
                use_tls=settings.smtp_tls == "tls",
                start_tls=settings.smtp_tls == "starttls",
                timeout=settings.smtp_timeout,
            )
        except (aiosmtplib.SMTPException, OSError) as error:
            raise MailError("mail_failed") from error
