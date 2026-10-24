import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
PRODUCTION = ROOT / "compose.production.yaml"
ENVIRONMENT = {
    "UPGRADE_RELEASE": "test",
    "UPGRADE_TLS_DIR": "/tmp",
    "UPGRADE_ACME_DIR": "/tmp",
    "UPGRADE_ENV_FILE": "deployment/production.env.example",
    "UPGRADE_S3_CONFIG": "./deployment/s3.example.json",
}

pytestmark = pytest.mark.skipif(shutil.which("docker") is None, reason="docker is not installed")


def compose_config(**changes: str) -> subprocess.CompletedProcess:
    env = {**os.environ, **ENVIRONMENT, **changes}
    return subprocess.run(
        ["docker", "compose", "-f", str(PRODUCTION), "config", "--format", "json"],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )


@pytest.fixture(scope="module")
def services() -> dict:
    result = compose_config()
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)["services"]


def test_release_label_is_required():
    result = compose_config(UPGRADE_RELEASE="")

    assert result.returncode != 0
    assert "immutable release label" in result.stderr


def test_services_restart_and_report_health(services):
    for name in ("db", "s3", "api", "worker", "frontend"):
        assert services[name]["restart"] == "unless-stopped", name
        assert "healthcheck" in services[name], name
    assert services["migrate"]["restart"] == "no"


def test_application_runs_without_root_and_read_only(services):
    for name in ("migrate", "api", "worker", "frontend"):
        assert services[name]["user"] in ("10001:10001", "101:101"), name
        assert services[name]["read_only"] is True, name
        assert services[name]["cap_drop"] == ["ALL"], name


def test_only_the_web_server_is_published(services):
    published = {name for name, service in services.items() if service.get("ports")}

    assert published == {"frontend"}
    assert services["api"]["environment"]["STAND_ENABLED"] == "false"
    assert services["api"]["environment"]["APP_ENV"] == "production"
