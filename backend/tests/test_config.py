import ast
from pathlib import Path

import pytest
from pydantic import ValidationError

from app import config
from app.config import Settings

SAFE = {
    "app_env": "production",
    "cookie_secure": True,
    "stand_enabled": False,
    "public_url": "https://upgrade.example",
    "s3_secret_key": "real-secret",
    "database_url": "postgresql+asyncpg://app:strong@db:5432/upgrade",
    "analysis_variant": "real-model",
    "analysis_api_key": "real-key",
    "smtp_host": "smtp.example.ru",
    "smtp_tls": "tls",
    "mail_from": "UpGrade <no-reply@upgrade.example>",
    "allowed_origins": ["https://upgrade.example"],
    "terms_url": "https://upgrade.example/legal/terms",
    "personal_data_url": "https://upgrade.example/legal/personal-data",
    "s3_access_key": "upgrade-app",
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
        ("analysis_variant", "sim"),
        ("analysis_api_key", ""),
        ("smtp_host", "mailpit"),
        ("smtp_tls", "none"),
        ("mail_from", "UpGrade <no-reply@upgrade.local>"),
        ("allowed_origins", ["https://other.example"]),
        ("allowed_origins", ["https://upgrade.example", "http://localhost:5173"]),
        ("terms_url", "http://upgrade.example/legal/terms"),
        ("yandex_client_id", "client-without-secret"),
        ("s3_access_key", "upgrade"),
    ],
)
def test_unsafe_production_settings_are_rejected(field, value):
    with pytest.raises(ValidationError):
        Settings(**{**SAFE, field: value})


def test_development_defaults_are_allowed():
    assert Settings().app_env == "development"


def test_lease_must_outlive_heartbeat():
    with pytest.raises(ValidationError):
        Settings(lease_seconds=5.0, heartbeat_seconds=10.0)


def test_settings_fields_are_declared_once():
    tree = ast.parse(Path(config.__file__).read_text())
    settings = next(
        node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "Settings"
    )
    names = [
        item.target.id
        for item in settings.body
        if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name)
    ]

    assert len(names) == len(set(names))
