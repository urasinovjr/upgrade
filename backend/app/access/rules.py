import hashlib
import secrets
from datetime import datetime, timedelta

MIN_PASSWORD_LENGTH = 10
MAX_PASSWORD_LENGTH = 128


def normalize_email(email: str) -> str:
    return email.strip().lower()


def password_is_weak(password: str, email: str | None) -> bool:
    if not MIN_PASSWORD_LENGTH <= len(password) <= MAX_PASSWORD_LENGTH:
        return True
    if password.strip() != password or password.isdigit() or len(set(password)) < 4:
        return True
    return email is not None and password.lower() == normalize_email(email)


def lock_until(failed_logins: int, threshold: int, max_minutes: int, now: datetime):
    if failed_logins < threshold:
        return None
    minutes = min(2 ** (failed_logins - threshold), max_minutes)
    return now + timedelta(minutes=minutes)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
