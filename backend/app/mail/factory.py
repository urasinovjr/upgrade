from app.config import Settings
from app.mail.mailer import Mailer, SmtpMailer
from app.mail.unisender import UnisenderMailer


def make_mailer(settings: Settings) -> Mailer:
    if settings.mail_transport == "unisender":
        return UnisenderMailer(settings)
    return SmtpMailer(settings)
