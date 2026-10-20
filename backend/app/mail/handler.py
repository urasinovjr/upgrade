from email.message import EmailMessage

from sqlalchemy import update

from app.mail.mailer import MailError
from app.mail.templates import build_letter
from app.queue import Job, JobFailure, WorkerContext, complete_job


def without_token(payload: dict) -> dict:
    return {key: value for key, value in payload.items() if key != "token"}


async def handle_send_email(context: WorkerContext, job: Job) -> None:
    payload = job.payload
    letter = build_letter(payload["template"], context.settings.public_url, payload.get("token"))
    message = EmailMessage()
    message["From"] = context.settings.mail_from
    message["To"] = payload["to"]
    message["Subject"] = letter.subject
    message.set_content(letter.text)
    try:
        await context.mailer.send(message)
    except MailError as error:
        raise JobFailure(error.code) from error
    async with context.sessions() as session:
        await complete_job(session, job.id, without_token(payload))
        await session.commit()


async def forget_email_token(context: WorkerContext, job: Job) -> None:
    async with context.sessions() as session:
        await session.execute(
            update(Job).where(Job.id == job.id).values(payload=without_token(job.payload))
        )
        await session.commit()
