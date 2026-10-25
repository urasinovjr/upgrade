import argparse
import asyncio
import csv
import json
import os
import time
from pathlib import Path

import httpx
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from loadgen.client import send_upload
from loadgen.scenario import CONDITIONS, PAGE_BYTES, POLL_INTERVAL, TIME_SCALE, build_uploads
from loadgen.stand import (
    clock_offset,
    collect_outcomes,
    configure_provider,
    crash_processing,
    ensure_running,
    provider_stats,
    reset_database,
    reset_storage,
    wait_until_settled,
)

PROTOCOL = 2
PROTOCOL_DIRS = {
    1: Path(__file__).resolve().parent / "results",
    2: Path(__file__).resolve().parent / "results" / "protocol-2",
}
RESULTS_DIR = PROTOCOL_DIRS[PROTOCOL] / "runs"
DATABASE_URL = "postgresql+asyncpg://upgrade:upgrade@localhost:5433/upgrade"
API_URL = "http://localhost:8010"
SIM_URL = "http://localhost:8011"
PROCESSING_SERVICE = {"sync": "api", "async": "worker", "sync-idem": "api"}
MODES = list(PROCESSING_SERVICE)


def run_name(
    mode: str, profile: str, level: int, seed: int, workers: int = 1, condition: str = "base"
) -> str:
    name = f"{mode}-{profile}-x{level}-s{seed}"
    if workers != 1:
        name += f"-w{workers}"
    if condition != "base":
        name += f"-c{condition}"
    return name


def run_done(name: str) -> bool:
    meta_path = RESULTS_DIR / f"{name}.json"
    return meta_path.exists() and json.loads(meta_path.read_text()).get("valid", True)


def merge_row(client_row: dict, outcome: dict | None, offset: float) -> dict:
    outcome = outcome or {"works": 0, "results": 0, "first_result_at": None, "failed": False}
    ready_s = None
    if outcome["first_result_at"] is not None:
        ready_s = float(outcome["first_result_at"]) - offset - client_row["first_send"]
    return {
        **client_row,
        "works": outcome["works"],
        "results": outcome["results"],
        "failed": outcome["failed"],
        "job_attempts": outcome.get("job_attempts", 0),
        "ready_s": ready_s,
    }


async def run_once(
    engine: AsyncEngine,
    mode: str,
    profile: str,
    level: int,
    seed: int,
    crashes: bool,
    workers: int = 1,
    condition: str = "base",
) -> Path:
    setup = CONDITIONS[condition]
    await ensure_running(workers, setup.env)
    await reset_database(engine)
    if setup.upload:
        await reset_storage()
    page = os.urandom(PAGE_BYTES) if setup.upload else None
    await configure_provider(SIM_URL, profile, seed, TIME_SCALE)
    offset = await clock_offset(engine)
    uploads = build_uploads(level, seed)

    limits = httpx.Limits(max_connections=2000, max_keepalive_connections=200)
    async with httpx.AsyncClient(base_url=API_URL, limits=limits, trust_env=False) as http:
        started = time.time() + 1.0
        service = PROCESSING_SERVICE[mode]
        replicas = workers if service == "worker" else 1
        crash = None
        if crashes:
            crash = asyncio.create_task(crash_processing(service, started, replicas, offset))
        client_rows = await asyncio.gather(
            *(send_upload(http, mode, upload, started, page) for upload in uploads)
        )
        restarts = await crash if crash else []
    await ensure_running(workers, setup.env)
    await wait_until_settled(engine)

    outcomes = await collect_outcomes(engine)
    rows = [merge_row(row, outcomes.get(row["upload_id"]), offset) for row in client_rows]
    name = run_name(mode, profile, level, seed, workers, condition)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    csv_path = RESULTS_DIR / f"{name}.csv"
    with csv_path.open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    meta = {
        "mode": mode,
        "profile": profile,
        "level": level,
        "seed": seed,
        "crashes": crashes,
        "workers": workers,
        "condition": condition,
        "condition_env": setup.env,
        "protocol": PROTOCOL,
        "poll_interval": POLL_INTERVAL,
        "time_scale": TIME_SCALE,
        "uploads": len(uploads),
        "valid": any(row["accepted"] for row in client_rows),
        "clock_offset": offset,
        "restarts": restarts,
        "provider": await provider_stats(SIM_URL),
    }
    (RESULTS_DIR / f"{name}.json").write_text(json.dumps(meta, indent=2))
    return csv_path


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=MODES, required=True)
    parser.add_argument("--profile", choices=["normal", "degraded"], default="normal")
    parser.add_argument("--level", type=int, default=1)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--no-crashes", action="store_true")
    parser.add_argument("--workers", type=int, default=1)
    parser.add_argument("--condition", choices=list(CONDITIONS), default="base")
    args = parser.parse_args()
    engine = create_async_engine(DATABASE_URL)
    try:
        path = await run_once(
            engine,
            args.mode,
            args.profile,
            args.level,
            args.seed,
            not args.no_crashes,
            args.workers,
            args.condition,
        )
    finally:
        await engine.dispose()
    print(path)


if __name__ == "__main__":
    asyncio.run(main())
