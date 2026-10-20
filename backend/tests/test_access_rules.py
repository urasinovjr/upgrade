from datetime import UTC, datetime, timedelta

from app.access.rules import lock_until, normalize_email, password_is_weak, token_hash

NOW = datetime(2026, 10, 21, tzinfo=UTC)


def test_email_is_trimmed_and_lowercased():
    assert normalize_email("  Teacher@Example.COM ") == "teacher@example.com"


def test_password_rules():
    assert password_is_weak("short", None)
    assert password_is_weak("aaaaaaaaaa", None)
    assert password_is_weak("1234567890", None)
    assert password_is_weak(" padded password ", None)
    assert password_is_weak("teacher@example.com", "Teacher@example.com")
    assert not password_is_weak("correct horse 42", "teacher@example.com")


def test_lock_starts_at_threshold_and_grows():
    assert lock_until(4, 5, 15, NOW) is None
    assert lock_until(5, 5, 15, NOW) == NOW + timedelta(minutes=1)
    assert lock_until(7, 5, 15, NOW) == NOW + timedelta(minutes=4)
    assert lock_until(20, 5, 15, NOW) == NOW + timedelta(minutes=15)


def test_token_hash_is_stable_and_hides_token():
    assert token_hash("abc") == token_hash("abc")
    assert "abc" not in token_hash("abc")
