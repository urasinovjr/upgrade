from uuid import uuid4

import pytest

from app.mail import build_letter, enqueue_email
from app.queue import Job, claim_job
from app.worker import handle_job
from tests.conftest import worker_context
from tests.fakes import MemoryMailer


def test_confirm_letter_links_to_frontend():
    letter = build_letter("confirm", "https://upgrade.example/", "abc def")

    assert "https://upgrade.example/auth/confirm?token=abc+def" in letter.text


def test_reset_letter_links_to_reset_page():
    letter = build_letter("reset", "https://upgrade.example", "t1")

    assert "https://upgrade.example/auth/reset/confirm?token=t1" in letter.text


def test_account_exists_letter_has_no_token():
    letter = build_letter("account_exists", "https://upgrade.example", None)

    assert "token" not in letter.text
    assert "https://upgrade.example/login" in letter.text


def test_unknown_letter_is_a_bug():
    with pytest.raises(ValueError):
        build_letter("confirm", "https://upgrade.example", None)


async def queued_email(sessions, attempts: int = 3) -> Job:
    async with sessions() as session:
        await enqueue_email(session, uuid4(), "teacher@example.com", "confirm", attempts, "tok")
        await session.commit()
    async with sessions() as session:
        return await claim_job(session, lease_seconds=5)


async def stored(sessions, job_id) -> Job:
    async with sessions() as session:
        return await session.get(Job, job_id)


async def test_sent_email_forgets_token(sessions, test_settings):
    mailer = MemoryMailer()
    job = await queued_email(sessions)

    await handle_job(worker_context(sessions, test_settings, mailer=mailer), job)

    assert [message["To"] for message in mailer.sent] == ["teacher@example.com"]
    assert "token=tok" in mailer.sent[0].get_content()
    job_after = await stored(sessions, job.id)
    assert job_after.status == "done"
    assert "token" not in job_after.payload


async def test_failed_email_is_retried_with_token(sessions, test_settings):
    job = await queued_email(sessions)

    await handle_job(worker_context(sessions, test_settings, mailer=MemoryMailer(1)), job)

    job_after = await stored(sessions, job.id)
    assert job_after.status == "retrying"
    assert job_after.payload["token"] == "tok"


async def test_email_on_last_attempt_drops_token(sessions, test_settings):
    job = await queued_email(sessions, attempts=1)

    await handle_job(worker_context(sessions, test_settings, mailer=MemoryMailer(1)), job)

    job_after = await stored(sessions, job.id)
    assert job_after.status == "failed"
    assert "token" not in job_after.payload
