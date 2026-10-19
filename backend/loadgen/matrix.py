import argparse
import asyncio
import time

from sqlalchemy.ext.asyncio import create_async_engine

from loadgen.run import DATABASE_URL, RESULTS_DIR, run_name, run_once

MODES = ["sync", "async"]
PROFILES = ["normal", "degraded"]
LEVELS = [1, 5, 10]
SEEDS = [1, 2, 3, 4, 5]


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-done", action="store_true")
    args = parser.parse_args()
    engine = create_async_engine(DATABASE_URL)
    plan = [
        (mode, profile, level, seed)
        for profile in PROFILES
        for level in LEVELS
        for seed in SEEDS
        for mode in MODES
    ]
    try:
        for number, (mode, profile, level, seed) in enumerate(plan, start=1):
            name = run_name(mode, profile, level, seed)
            if args.skip_done and (RESULTS_DIR / f"{name}.json").exists():
                continue
            started = time.time()
            await run_once(engine, mode, profile, level, seed, crashes=True)
            print(f"{number}/{len(plan)} {name} {time.time() - started:.0f}s", flush=True)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
