import json
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LAB = ROOT / "output/production-lab"
PROJECT = "upgrade-production-check"
HTTP_PORT = int(os.environ.get("LAB_HTTP_PORT", "28080"))
HTTPS_PORT = int(os.environ.get("LAB_HTTPS_PORT", "28443"))
MAIL_PORT = int(os.environ.get("LAB_MAIL_PORT", "28025"))
BASE_URL = f"https://127.0.0.1:{HTTPS_PORT}"
PLAYWRIGHT_IMAGE = (
    "mcr.microsoft.com/playwright:v1.63.0-noble@sha256:"
    "eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27"
)


def run(command, **kwargs):
    return subprocess.run(command, check=True, cwd=kwargs.pop("cwd", ROOT), **kwargs)


def compose(*arguments, **kwargs):
    return run(
        ["docker", "compose", "-p", PROJECT, "-f", str(LAB / "compose.json"), *arguments], **kwargs
    )


def prepare(sha: str) -> None:
    LAB.mkdir(parents=True, exist_ok=True)
    if (LAB / "backup").exists():
        shutil.rmtree(LAB / "backup")
    tls = LAB / "tls"
    tls.mkdir(exist_ok=True)
    run(
        [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-days",
            "2",
            "-keyout",
            str(tls / "privkey.pem"),
            "-out",
            str(tls / "fullchain.pem"),
            "-subj",
            "/CN=127.0.0.1",
            "-addext",
            "subjectAltName=IP:127.0.0.1",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    (tls / "privkey.pem").chmod(0o644)
    (LAB / "s3.json").write_text(
        json.dumps(
            {
                "identities": [
                    {
                        "name": "lab",
                        "credentials": [
                            {"accessKey": "upgrade-app", "secretKey": "lab-storage-secret"}
                        ],
                        "actions": ["Admin", "Read", "Write", "List", "Tagging"],
                    }
                ]
            }
        )
    )
    settings = {
        "POSTGRES_USER": "upgrade",
        "POSTGRES_PASSWORD": "upgrade",
        "POSTGRES_DB": "upgrade",
        "DATABASE_URL": "postgresql+asyncpg://upgrade:upgrade@db:5432/upgrade",
        "PUBLIC_URL": BASE_URL,
        "COOKIE_SECURE": "true",
        "ALLOWED_ORIGINS": json.dumps([BASE_URL]),
        "TERMS_URL": BASE_URL + "/legal/terms",
        "PERSONAL_DATA_URL": BASE_URL + "/legal/personal-data",
        "S3_ACCESS_KEY": "upgrade-app",
        "S3_SECRET_KEY": "lab-storage-secret",
        "MAIL_TRANSPORT": "smtp",
        "SMTP_HOST": "mailpit",
        "SMTP_PORT": "1025",
        "ANALYSIS_VARIANT": "sim",
        "PROVIDER_URL": "http://provider-sim:8001",
    }
    (LAB / "test.env").write_text("".join(f"{key}={value}\n" for key, value in settings.items()))
    environment = {
        **os.environ,
        "UPGRADE_RELEASE": sha,
        "UPGRADE_BACKEND_IMAGE": f"ghcr.io/urasinovjr/upgrade-backend:{sha}",
        "UPGRADE_FRONTEND_IMAGE": f"ghcr.io/urasinovjr/upgrade-frontend:{sha}",
        "UPGRADE_ENV_FILE": str(LAB / "test.env"),
        "UPGRADE_TLS_DIR": str(tls),
        "UPGRADE_ACME_DIR": str(LAB),
        "UPGRADE_S3_CONFIG": str(LAB / "s3.json"),
    }
    result = run(
        ["docker", "compose", "-f", "compose.production.yaml", "config", "--format", "json"],
        env=environment,
        capture_output=True,
        text=True,
    )
    config = json.loads(result.stdout)
    for section in ("networks", "volumes"):
        for definition in config.get(section, {}).values():
            definition.pop("name", None)
    for service in ("api", "worker", "migrate"):
        config["services"][service]["environment"]["APP_ENV"] = "test"
    config["services"]["frontend"]["ports"] = [
        {"target": 8080, "published": str(HTTP_PORT), "host_ip": "127.0.0.1", "protocol": "tcp"},
        {"target": 8443, "published": str(HTTPS_PORT), "host_ip": "127.0.0.1", "protocol": "tcp"},
    ]
    config["services"]["mailpit"] = {
        "image": "axllent/mailpit:v1.31.6@sha256:"
        "23fe39e81bde596a918000b3135c0f85dc8bb4c9ea6be274b051143f3e300387",
        "networks": {"data": None, "outbound": None},
        "ports": [f"127.0.0.1:{MAIL_PORT}:8025"],
    }
    config["services"]["provider-sim"] = {
        "build": {"context": str(ROOT / "backend/provider_sim")},
        "networks": {"data": None},
    }
    (LAB / "compose.json").write_text(json.dumps(config, indent=2))


def browser_environment() -> dict:
    return {
        **os.environ,
        "E2E_BASE_URL": BASE_URL,
        "E2E_MAILPIT_URL": f"http://127.0.0.1:{MAIL_PORT}",
        "E2E_SELF_SIGNED_TLS": "1",
        "E2E_COMPOSE_PROJECT": PROJECT,
        "E2E_COMPOSE_FILE": str(LAB / "compose.json"),
    }


def run_browser() -> None:
    environment = browser_environment()
    if os.environ.get("UPGRADE_BROWSER_CONTAINER") != "1":
        run(["npm", "run", "e2e:server"], cwd=ROOT / "frontend", env=environment)
        return
    client = shutil.which("docker")
    if client is None:
        raise RuntimeError("Docker client is required for browser checks")
    plugins = run(
        ["docker", "info", "--format", "{{json .ClientInfo.Plugins}}"],
        capture_output=True,
        text=True,
    )
    plugin = next(item["Path"] for item in json.loads(plugins.stdout) if item["Name"] == "compose")
    command = ["docker", "run", "--rm", "--ipc=host", "--network=host", "-e", "CI=1"]
    for source, target in (
        (str(ROOT), str(ROOT)),
        ("/var/run/docker.sock", "/var/run/docker.sock"),
        (str(Path(client).resolve()), "/usr/local/bin/docker"),
        (str(Path(plugin).resolve()), "/usr/local/lib/docker/cli-plugins/docker-compose"),
    ):
        command += ["-v", f"{source}:{target}" + (":ro" if source != str(ROOT) else "")]
    for key, value in environment.items():
        if key.startswith("E2E_"):
            command += ["-e", f"{key}={value}"]
    run([*command, "-w", str(ROOT / "frontend"), PLAYWRIGHT_IMAGE, "npm", "run", "e2e:server"])
