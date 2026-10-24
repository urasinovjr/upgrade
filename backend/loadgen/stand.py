import asyncio
import os
import time
from pathlib import Path

import httpx
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine

from app.config import Settings
from app.files import S3Storage
from loadgen.scenario import CRASH_AT_SECONDS, CRASH_DOWN_SECONDS

COMPOSE_FILE = Path(__file__).resolve().parents[2] / "compose.yaml"
SETTLE_LIMIT_SECONDS = 600.0
RESET_ATTEMPTS = 5
SETTLE_QUIET_CHECKS = 3

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


async def compose(*args: str, env: dict[str, str] | None = None) -> None:
    process = await asyncio.create_subprocess_exec(
        "docker",
        "compose",
        "-f",
        str(COMPOSE_FILE),
        *args,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
        env={**os.environ, **(env or {})},
    )
    await process.wait()


async def ensure_running(workers: int = 1, env: dict[str, str] | None = None) -> None:
    await compose("up", "-d", "--wait", "--scale", f"worker={workers}", env=env)


async def clear_pages() -> None:
    storage = await S3Storage.connect(Settings())
    try:
        await storage.delete_prefix("stand/")
    finally:
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


async def crash_processing(service: str, started: float) -> None:
    for crash_at in CRASH_AT_SECONDS:
        await asyncio.sleep(max(0.0, started + crash_at - time.time()))
        await compose("kill", "-s", "SIGKILL", service)
        await asyncio.sleep(CRASH_DOWN_SECONDS)
        await compose("start", service)


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
