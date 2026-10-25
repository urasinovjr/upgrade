import argparse
import asyncio
import itertools
import time

from sqlalchemy.ext.asyncio import create_async_engine

from loadgen.run import DATABASE_URL, MODES, run_done, run_name, run_once
from loadgen.scenario import CONDITIONS

PROFILES = ["normal", "degraded"]
LEVELS = [1, 5, 10]
SEEDS = [1, 2, 3, 4, 5]


def build_plan(args: argparse.Namespace) -> list[tuple]:
    return [
        (mode, profile, level, seed, args.workers, args.condition)
        for profile, level, seed, mode in itertools.product(
            args.profiles, args.levels, args.seeds, args.modes
        )
    ]


def parse(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-done", action="store_true")
    parser.add_argument("--modes", nargs="+", choices=MODES, default=["sync", "async"])
    parser.add_argument("--profiles", nargs="+", choices=PROFILES, default=PROFILES)
    parser.add_argument("--levels", type=int, nargs="+", default=LEVELS)
    parser.add_argument("--seeds", type=int, nargs="+", default=SEEDS)
    parser.add_argument("--workers", type=int, default=1)
    parser.add_argument("--condition", choices=list(CONDITIONS), default="base")
    return parser.parse_args(argv)


async def main() -> None:
    args = parse()
    plan = build_plan(args)
    engine = create_async_engine(DATABASE_URL)
    try:
        for number, run in enumerate(plan, start=1):
            name = run_name(*run)
            if args.skip_done and run_done(name):
                continue
            started = time.time()
            mode, profile, level, seed, workers, condition = run
            await run_once(engine, mode, profile, level, seed, True, workers, condition)
            print(f"{number}/{len(plan)} {name} {time.time() - started:.0f}s", flush=True)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
