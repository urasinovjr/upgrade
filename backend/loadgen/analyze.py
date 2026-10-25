import argparse
import csv
import json
import random
from collections import defaultdict
from pathlib import Path

from loadgen.run import PROTOCOL, PROTOCOL_DIRS

SYNC_MODES = {"sync", "sync-idem"}
BOOTSTRAP_ROUNDS = 2000
ACCEPT_LIMIT_SECONDS = 1.0
READY_LIMIT_SECONDS = 120.0


def percentile(values: list[float], share: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * share
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def bootstrap_p95(runs: list[list[float]]) -> tuple[float | None, float | None]:
    if not any(runs):
        return None, None
    rng = random.Random(0)
    estimates = []
    for _ in range(BOOTSTRAP_ROUNDS):
        pooled = []
        for values in runs:
            pooled.extend(rng.choices(values, k=len(values)) if values else [])
        estimates.append(percentile(pooled, 0.95))
    return percentile(estimates, 0.025), percentile(estimates, 0.975)


def pooled_p95(runs: list[list[float]]) -> float | None:
    return percentile([value for values in runs for value in values], 0.95)


def run_range(values: list[float | None]) -> tuple[float | None, float | None]:
    present = [value for value in values if value is not None]
    return (min(present), max(present)) if present else (None, None)


def scaled(value: float | None, scale: float) -> float | None:
    return value / scale if value is not None else None


def show(value: float | None, digits: int) -> str:
    return "-" if value is None else f"{value:.{digits}f}"


def read_run(csv_path: Path) -> tuple[dict, list[dict]]:
    meta = json.loads(csv_path.with_suffix(".json").read_text())
    with csv_path.open() as file:
        rows = list(csv.DictReader(file))
    return meta, rows


def run_metrics(rows: list[dict], protocol: int = 1) -> dict:
    accepted = [float(row["accept_s"]) for row in rows if row["accepted"] == "True"]
    stored = [float(row["ready_s"]) for row in rows if row["ready_s"]]
    polled = [float(row["polled_ready_s"]) for row in rows if row.get("polled_ready_s")]
    ready = polled if protocol >= 2 else stored
    delivered = [row for row in rows if int(row["results"]) > 0]
    undelivered = [row for row in rows if not int(row["results"])]
    saved_failures = [row for row in undelivered if row["failed"] == "True"]
    pending = [row for row in undelivered if int(row["works"]) and row["failed"] != "True"]
    return {
        "uploads": len(rows),
        "accepted_values": accepted,
        "ready_values": ready,
        "stored_ready_values": stored,
        "polls": sum(int(row.get("poll_count") or 0) for row in rows),
        "delivered": len(delivered),
        "duplicated": sum(1 for row in rows if int(row["results"]) > 1),
        "failed_saved": len(saved_failures),
        "pending": len(pending),
        "lost": sum(1 for row in undelivered if not int(row["works"])),
        "accept_p95": percentile(accepted, 0.95),
        "ready_p95": percentile(ready, 0.95),
    }


def condition_summary(key: tuple, runs: list[tuple[dict, dict]]) -> dict:
    mode, profile, level, workers, condition = key
    time_scale = runs[0][0]["time_scale"]
    metrics = [run for _, run in runs]
    accepted_runs = [run["accepted_values"] for run in metrics]
    ready_runs = [run["ready_values"] for run in metrics]
    accept_low, accept_high = bootstrap_p95(accepted_runs)
    ready_low, ready_high = bootstrap_p95(ready_runs)
    accept_p95 = pooled_p95(accepted_runs)
    ready_p95 = pooled_p95(ready_runs)
    ready_min, ready_max = run_range([run["ready_p95"] for run in metrics])
    accept_scale = time_scale if mode in SYNC_MODES else 1.0
    stored_p95 = pooled_p95([run["stored_ready_values"] for run in metrics])
    delivered = sum(run["delivered"] for run in metrics)
    analyze_calls = sum(meta["provider"].get("analyze_calls", 0) for meta, _ in runs)
    uploads = sum(run["uploads"] for run in metrics)
    summary = {
        "mode": mode,
        "profile": profile,
        "level": level,
        "workers": workers,
        "condition": condition,
        "protocol": runs[0][0].get("protocol", 1),
        "runs": len(runs),
        "uploads": uploads,
        "accepted": sum(len(values) for values in accepted_runs),
        "accepted_share": sum(len(values) for values in accepted_runs) / uploads,
        "delivered_share": delivered / uploads,
        "lost": sum(run["lost"] for run in metrics),
        "duplicated": sum(run["duplicated"] for run in metrics),
        "failed_saved": sum(run["failed_saved"] for run in metrics),
        "pending": sum(run["pending"] for run in metrics),
        "accept_p95_s": accept_p95,
        "accept_p95_low": accept_low,
        "accept_p95_high": accept_high,
        "accept_p95_real_s": scaled(accept_p95, accept_scale),
        "ready_p95_s": ready_p95,
        "ready_p95_low": ready_low,
        "ready_p95_high": ready_high,
        "ready_p95_real_s": scaled(ready_p95, time_scale),
        "ready_p95_run_min_real_s": scaled(ready_min, time_scale),
        "ready_p95_run_max_real_s": scaled(ready_max, time_scale),
        "stored_ready_p95_real_s": scaled(stored_p95, time_scale),
        "polls_per_upload": sum(run["polls"] for run in metrics) / uploads,
        "analyze_calls_per_delivered": analyze_calls / delivered if delivered else None,
    }
    summary["meets_h1"] = (
        summary["accepted_share"] >= 0.95
        and summary["accept_p95_real_s"] is not None
        and summary["accept_p95_real_s"] <= ACCEPT_LIMIT_SECONDS
        and summary["lost"] == 0
        and summary["duplicated"] == 0
        and summary["ready_p95_real_s"] is not None
        and summary["ready_p95_real_s"] <= READY_LIMIT_SECONDS
    )
    return summary


def run_key(meta: dict) -> tuple:
    return (
        meta["mode"],
        meta["profile"],
        meta["level"],
        meta.get("workers", 1),
        meta.get("condition", "base"),
    )


def invalid_runs(protocol: int) -> list[str]:
    folder = PROTOCOL_DIRS[protocol] / "runs"
    return [
        path.stem
        for path in sorted(folder.glob("*.json"))
        if not json.loads(path.read_text()).get("valid", True)
    ]


def summarize(protocol: int) -> list[dict]:
    skipped = set(invalid_runs(protocol))
    groups: dict[tuple, list[tuple[dict, dict]]] = defaultdict(list)
    for csv_path in sorted((PROTOCOL_DIRS[protocol] / "runs").glob("*.csv")):
        if csv_path.stem in skipped:
            continue
        meta, rows = read_run(csv_path)
        groups[run_key(meta)].append((meta, run_metrics(rows, protocol)))
    return [condition_summary(key, runs) for key, runs in sorted(groups.items())]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--protocol", type=int, choices=list(PROTOCOL_DIRS), default=PROTOCOL)
    protocol = parser.parse_args().protocol
    for name in invalid_runs(protocol):
        print(f"skipped invalid run {name}")
    summaries = summarize(protocol)
    with (PROTOCOL_DIRS[protocol] / "summary.csv").open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(summaries[0]))
        writer.writeheader()
        writer.writerows(summaries)
    for summary in summaries:
        print(
            f"{summary['mode']:>9} {summary['profile']:>8} x{summary['level']:<2} "
            f"w{summary['workers']} {summary['condition']} "
            f"accepted={summary['accepted_share']:.1%} "
            f"accept_p95_real={show(summary['accept_p95_real_s'], 2)}s "
            f"ready_p95_real={show(summary['ready_p95_real_s'], 0)}s "
            f"delivered={summary['delivered_share']:.1%} lost={summary['lost']} "
            f"dup={summary['duplicated']} failed={summary['failed_saved']} "
            f"pending={summary['pending']} h1={summary['meets_h1']}"
        )


if __name__ == "__main__":
    main()
