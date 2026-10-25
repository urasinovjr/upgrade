import asyncio
import json
import os
import time
from datetime import datetime
from pathlib import Path

import httpx
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine

from app.config import Settings
from app.files import S3Storage
from loadgen.scenario import CRASH_AT_SECONDS, CRASH_DOWN_SECONDS

COMPOSE_FILE = Path(__file__).resolve().parents[2] / "compose.yaml"
S3_VOLUME = f"{COMPOSE_FILE.parent.name}_s3_data"
SETTLE_LIMIT_SECONDS = 600.0
RESET_ATTEMPTS = 5
SETTLE_QUIET_CHECKS = 3
RESTART_LIMIT_SECONDS = 30.0
READY_EVENTS = {"worker": "worker_started", "api": "Application startup complete."}

OUTCOMES = text(
    """
    SELECT w.upload_id,
           count(DISTINCT w.id) AS works,
           count(DISTINCT r.id) AS results,
           extract(epoch FROM min(r.created_at)) AS first_result_at,
           coalesce(bool_or(j.status = 'failed'), false) AS failed,
           coalesce(max(j.attempts), 0) AS job_attempts
    FROM stand_works w
    LEFT JOIN stand_results r ON r.work_id = w.id
    LEFT JOIN jobs j ON j.subject_id = w.id AND j.kind = 'stand_analysis'
    GROUP BY w.upload_id
    """
)


async def docker(*args: str, env: dict[str, str] | None = None) -> None:
    process = await asyncio.create_subprocess_exec(
        "docker",
        *args,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
        env={**os.environ, **(env or {})},
    )
    await process.wait()


async def compose(*args: str, env: dict[str, str] | None = None) -> None:
    await docker("compose", "-f", str(COMPOSE_FILE), *args, env=env)


async def compose_output(*args: str) -> str:
    process = await asyncio.create_subprocess_exec(
        "docker",
        "compose",
        "-f",
        str(COMPOSE_FILE),
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    output, _ = await process.communicate()
    return output.decode()


def ready_times(logs: str, event: str) -> list[float]:
    times = []
    for line in logs.splitlines():
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        if record.get("event") == event:
            times.append(datetime.fromisoformat(record["ts"]).timestamp())
    return sorted(times)


async def wait_until_restarted(service: str, since: float, replicas: int) -> float | None:
    deadline = time.time() + RESTART_LIMIT_SECONDS
    while time.time() < deadline:
        logs = await compose_output("logs", "--no-log-prefix", "--since", f"{since:.3f}", service)
        times = ready_times(logs, READY_EVENTS[service])
        if len(times) >= replicas:
            return times[replicas - 1]
        await asyncio.sleep(0.2)
    return None


async def ensure_running(workers: int = 1, env: dict[str, str] | None = None) -> None:
    await compose("up", "-d", "--wait", "--scale", f"worker={workers}", env=env)


async def reset_storage() -> None:
    await compose("rm", "-sf", "s3")
    await docker("volume", "rm", "-f", S3_VOLUME)
    await compose("up", "-d", "--wait", "s3")
    storage = await S3Storage.connect(Settings())
    await storage.close()


async def reset_database(engine: AsyncEngine) -> None:
    for attempt in range(1, RESET_ATTEMPTS + 1):
        try:
            async with engine.begin() as connection:
                await connection.execute(text("TRUNCATE stand_results, stand_works"))
                await connection.execute(text("DELETE FROM jobs WHERE kind = 'stand_analysis'"))
            return
        except DBAPIError:
            if attempt == RESET_ATTEMPTS:
                raise
            await asyncio.sleep(2.0)


async def configure_provider(sim_url: str, profile: str, seed: int, time_scale: float) -> None:
    async with httpx.AsyncClient(base_url=sim_url, trust_env=False) as http:
        response = await http.post(
            "/config", json={"profile": profile, "seed": seed, "time_scale": time_scale}
        )
        response.raise_for_status()


async def provider_stats(sim_url: str) -> dict:
    async with httpx.AsyncClient(base_url=sim_url, trust_env=False) as http:
        response = await http.get("/stats")
        response.raise_for_status()
        return response.json()


async def clock_offset(engine: AsyncEngine) -> float:
    async with engine.connect() as connection:
        before = time.time()
        server_now = await connection.scalar(text("SELECT extract(epoch FROM clock_timestamp())"))
        after = time.time()
    return float(server_now) - (before + after) / 2


async def crash_processing(
    service: str, started: float, replicas: int, offset: float
) -> list[dict]:
    restarts = []
    for crash_at in CRASH_AT_SECONDS:
        await asyncio.sleep(max(0.0, started + crash_at - time.time()))
        killed_at = time.time()
        await compose("kill", "-s", "SIGKILL", service)
        await asyncio.sleep(CRASH_DOWN_SECONDS)
        started_at = time.time()
        await compose("start", service)
        ready_at = await wait_until_restarted(service, killed_at + offset, replicas)
        restarts.append(
            {
                "killed_at": killed_at,
                "started_at": started_at,
                "ready_at": ready_at - offset if ready_at is not None else None,
            }
        )
    return restarts


async def wait_until_settled(engine: AsyncEngine) -> None:
    deadline = time.time() + SETTLE_LIMIT_SECONDS
    last_results = -1
    quiet_checks = 0
    while time.time() < deadline and quiet_checks < SETTLE_QUIET_CHECKS:
        await asyncio.sleep(1.0)
        async with engine.connect() as connection:
            active = await connection.scalar(
                text(
                    "SELECT count(*) FROM jobs WHERE kind = 'stand_analysis' "
                    "AND status IN ('queued', 'running', 'retrying')"
                )
            )
            results = await connection.scalar(text("SELECT count(*) FROM stand_results"))
        quiet = active == 0 and results == last_results
        quiet_checks = quiet_checks + 1 if quiet else 0
        last_results = results


async def collect_outcomes(engine: AsyncEngine) -> dict[str, dict]:
    async with engine.connect() as connection:
        rows = (await connection.execute(OUTCOMES)).mappings().all()
    return {row["upload_id"]: dict(row) for row in rows}
