import json
import os
import ssl
import subprocess
import urllib.error
import urllib.request

from deployment.lab import BASE_URL, LAB, PROJECT, ROOT, compose, prepare, run, run_browser


def check_http() -> None:
    context = ssl.create_default_context(cafile=str(LAB / "tls/fullchain.pem"))
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=context)
    )
    for path in ("/", "/legal/terms", "/legal/personal-data", "/health/ready"):
        with opener.open(BASE_URL + path, timeout=15) as response:
            assert response.status == 200
            assert "default-src 'self'" in response.headers["Content-Security-Policy"]
    for path in ("/api/docs", "/api/openapi.json", "/api/stand/works"):
        try:
            opener.open(BASE_URL + path, timeout=15)
        except urllib.error.HTTPError as error:
            assert error.code == 404
        else:
            raise AssertionError(f"Technical route is open: {path}")


def restore_check() -> None:
    environment = {**os.environ, "UPGRADE_COMPOSE_FILE": str(LAB / "compose.json")}
    run(
        ["python3", "-m", "deployment.backup", str(LAB / "backup"), "-p", PROJECT],
        cwd=ROOT / "backend",
        env=environment,
    )
    run(
        [
            "python3",
            "-m",
            "deployment.restore",
            str(LAB / "backup"),
            "-p",
            "upgrade-production-restore-check",
        ],
        cwd=ROOT / "backend",
        env=environment,
    )


def scan(sha: str) -> None:
    cache = ROOT / "output/trivy-cache"
    cache.mkdir(parents=True, exist_ok=True)
    for service in ("backend", "frontend"):
        run(
            [
                "docker",
                "run",
                "--rm",
                "-v",
                "/var/run/docker.sock:/var/run/docker.sock",
                "-v",
                f"{cache}:/root/.cache/",
                "aquasec/trivy@sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa",
                "image",
                "--scanners",
                "vuln",
                "--ignore-unfixed",
                "--severity",
                "HIGH,CRITICAL",
                "--exit-code",
                "1",
                f"ghcr.io/urasinovjr/upgrade-{service}:{sha}",
            ]
        )


def stored_state() -> str:
    result = compose(
        "exec",
        "-T",
        "db",
        "psql",
        "-U",
        "upgrade",
        "-d",
        "upgrade",
        "-Atc",
        "SELECT version_num FROM alembic_version; SELECT count(*) FROM users; "
        "SELECT count(*) FROM works; SELECT count(*) FROM work_files;",
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def failure_checks() -> None:
    before = stored_state()
    compose("stop", "api", "worker")
    failed = subprocess.run(
        [
            "docker",
            "compose",
            "-p",
            PROJECT,
            "-f",
            str(LAB / "compose.json"),
            "run",
            "--rm",
            "--no-deps",
            "-e",
            "DATABASE_URL=postgresql+asyncpg://invalid:invalid@db/invalid",
            "migrate",
        ],
        cwd=ROOT,
        capture_output=True,
    )
    assert failed.returncode != 0 and stored_state() == before
    compose("up", "-d", "--no-build", "--wait", "--wait-timeout", "180")
    broken = json.loads((LAB / "compose.json").read_text())
    broken["services"]["api"]["command"] = ["python", "-c", "raise SystemExit(1)"]
    broken["services"]["api"]["restart"] = "no"
    (LAB / "broken.json").write_text(json.dumps(broken))
    failed = subprocess.run(
        [
            "docker",
            "compose",
            "-p",
            PROJECT,
            "-f",
            str(LAB / "broken.json"),
            "up",
            "-d",
            "--no-deps",
            "--no-build",
            "--wait",
            "--wait-timeout",
            "30",
            "api",
        ],
        cwd=ROOT,
        capture_output=True,
    )
    assert failed.returncode != 0 and stored_state() == before
    compose("up", "-d", "--no-build", "--wait", "--wait-timeout", "180")
    assert stored_state() == before
    check_http()


def main() -> None:
    sha = os.environ["GITHUB_SHA"]
    prepare(sha)
    try:
        compose("up", "-d", "--build", "--wait", "--wait-timeout", "180")
        compose("exec", "-T", "frontend", "nginx", "-t")
        check_http()
        run_browser()
        restore_check()
        failure_checks()
        compose("restart", "api", "worker", "frontend")
        compose("up", "-d", "--no-build", "--wait", "--wait-timeout", "180")
        check_http()
        before = stored_state()
        for _ in range(2):
            compose(
                "up", "-d", "--no-build", "--force-recreate", "--wait", "api", "worker", "frontend"
            )
            compose("rm", "-f", "migrate")
        check_http()
        assert stored_state() == before
        stopped = run(
            [
                "docker",
                "ps",
                "-aq",
                "--filter",
                f"label=com.docker.compose.project={PROJECT}",
                "--filter",
                "status=exited",
            ],
            capture_output=True,
            text=True,
        )
        assert not stopped.stdout.strip(), "Stopped project containers remain after updates"
        scan(sha)
        (LAB / "report.json").write_text(
            json.dumps(
                {
                    "sha": sha,
                    "tls": True,
                    "restore": True,
                    "restarts": True,
                    "repeatUpdates": 2,
                    "migrationFailure": True,
                    "startupFailure": True,
                    "stoppedContainers": 0,
                }
            )
        )
    except (subprocess.CalledProcessError, AssertionError):
        compose("logs", "--no-color", "--tail", "100")
        raise
    finally:
        compose("down", "-v", "--remove-orphans")


if __name__ == "__main__":
    main()
