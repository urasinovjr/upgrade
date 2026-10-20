import pytest
from pydantic import ValidationError

from app.config import Settings

SAFE = {
    "app_env": "production",
    "cookie_secure": True,
    "stand_enabled": False,
    "public_url": "https://upgrade.example",
    "s3_secret_key": "real-secret",
    "database_url": "postgresql+asyncpg://app:strong@db:5432/upgrade",
}


def test_production_settings_pass_when_safe():
    assert Settings(**SAFE).app_env == "production"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("cookie_secure", False),
        ("stand_enabled", True),
        ("public_url", "http://upgrade.example"),
        ("s3_secret_key", "upgrade-secret"),
        ("database_url", "postgresql+asyncpg://upgrade:upgrade@db:5432/upgrade"),
    ],
)
def test_unsafe_production_settings_are_rejected(field, value):
    with pytest.raises(ValidationError):
        Settings(**{**SAFE, field: value})


def test_development_defaults_are_allowed():
    assert Settings().app_env == "development"
