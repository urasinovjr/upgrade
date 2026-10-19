import asyncio
import time
from pathlib import Path

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from loadgen.scenario import CRASH_AT_SECONDS, CRASH_DOWN_SECONDS

COMPOSE_FILE = Path(__file__).resolve().parent.parent / "docker-compose.yml"
SETTLE_LIMIT_SECONDS = 120.0
SETTLE_QUIET_CHECKS = 3

OUTCOMES = text(
    """
    SELECT w.upload_id,
           count(DISTINCT w.id) AS works,
           count(DISTINCT r.id) AS results,
           extract(epoch FROM min(r.created_at)) AS first_result_at,
           coalesce(bool_or(j.status = 'failed'), false) AS failed,
           coalesce(max(j.attempts), 0) AS job_attempts
    FROM works w
    LEFT JOIN results r ON r.work_id = w.id
    LEFT JOIN jobs j ON j.work_id = w.id
    GROUP BY w.upload_id
    """
)


async def compose(*args: str) -> None:
    process = await asyncio.create_subprocess_exec(
        "docker",
        "compose",
        "-f",
        str(COMPOSE_FILE),
        *args,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    await process.wait()


async def ensure_running() -> None:
    await compose("up", "-d", "--wait")


async def reset_database(engine: AsyncEngine) -> None:
    async with engine.begin() as connection:
        await connection.execute(text("TRUNCATE results, jobs, works"))


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
                text("SELECT count(*) FROM jobs WHERE status IN ('queued', 'running', 'retrying')")
            )
            results = await connection.scalar(text("SELECT count(*) FROM results"))
        quiet = active == 0 and results == last_results
        quiet_checks = quiet_checks + 1 if quiet else 0
        last_results = results


async def collect_outcomes(engine: AsyncEngine) -> dict[str, dict]:
    async with engine.connect() as connection:
        rows = (await connection.execute(OUTCOMES)).mappings().all()
    return {row["upload_id"]: dict(row) for row in rows}
