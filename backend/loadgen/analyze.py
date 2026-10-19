import csv
import json
import random
import statistics
from collections import defaultdict
from pathlib import Path

from loadgen.run import RESULTS_DIR

SUMMARY_PATH = RESULTS_DIR.parent / "summary.csv"
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


def read_run(csv_path: Path) -> tuple[dict, list[dict]]:
    meta = json.loads(csv_path.with_suffix(".json").read_text())
    with csv_path.open() as file:
        rows = list(csv.DictReader(file))
    return meta, rows


def run_metrics(rows: list[dict]) -> dict:
    accepted = [float(row["accept_s"]) for row in rows if row["accepted"] == "True"]
    ready = [float(row["ready_s"]) for row in rows if row["ready_s"]]
    delivered = [row for row in rows if int(row["results"]) > 0]
    saved_failures = [row for row in rows if not int(row["results"]) and row["failed"] == "True"]
    return {
        "uploads": len(rows),
        "accepted_values": accepted,
        "ready_values": ready,
        "delivered": len(delivered),
        "duplicated": sum(1 for row in rows if int(row["results"]) > 1),
        "failed_saved": len(saved_failures),
        "lost": len(rows) - len(delivered) - len(saved_failures),
        "accept_p95": percentile(accepted, 0.95),
        "ready_p95": percentile(ready, 0.95),
    }


def condition_summary(key: tuple, runs: list[tuple[dict, dict]]) -> dict:
    mode, profile, level = key
    time_scale = runs[0][0]["time_scale"]
    metrics = [run for _, run in runs]
    accept_low, accept_high = bootstrap_p95([run["accepted_values"] for run in metrics])
    ready_low, ready_high = bootstrap_p95([run["ready_values"] for run in metrics])
    accept_p95 = statistics.median(run["accept_p95"] or 0.0 for run in metrics)
    ready_p95 = statistics.median(run["ready_p95"] or 0.0 for run in metrics)
    accept_scale = time_scale if mode == "sync" else 1.0
    delivered = sum(run["delivered"] for run in metrics)
    analyze_calls = sum(meta["provider"].get("analyze_calls", 0) for meta, _ in runs)
    uploads = sum(run["uploads"] for run in metrics)
    summary = {
        "mode": mode,
        "profile": profile,
        "level": level,
        "runs": len(runs),
        "uploads": uploads,
        "accepted_share": sum(len(run["accepted_values"]) for run in metrics) / uploads,
        "delivered_share": delivered / uploads,
        "lost": sum(run["lost"] for run in metrics),
        "duplicated": sum(run["duplicated"] for run in metrics),
        "failed_saved": sum(run["failed_saved"] for run in metrics),
        "accept_p95_s": accept_p95,
        "accept_p95_low": accept_low,
        "accept_p95_high": accept_high,
        "accept_p95_real_s": accept_p95 / accept_scale,
        "ready_p95_s": ready_p95,
        "ready_p95_low": ready_low,
        "ready_p95_high": ready_high,
        "ready_p95_real_s": ready_p95 / time_scale,
        "analyze_calls_per_delivered": analyze_calls / delivered if delivered else None,
    }
    summary["meets_h1"] = (
        summary["accept_p95_real_s"] <= ACCEPT_LIMIT_SECONDS
        and summary["lost"] == 0
        and summary["duplicated"] == 0
        and summary["ready_p95_real_s"] <= READY_LIMIT_SECONDS
    )
    return summary


def main() -> None:
    groups: dict[tuple, list[tuple[dict, dict]]] = defaultdict(list)
    for csv_path in sorted(RESULTS_DIR.glob("*.csv")):
        meta, rows = read_run(csv_path)
        key = (meta["mode"], meta["profile"], meta["level"])
        groups[key].append((meta, run_metrics(rows)))
    summaries = [condition_summary(key, runs) for key, runs in sorted(groups.items())]
    with SUMMARY_PATH.open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(summaries[0]))
        writer.writeheader()
        writer.writerows(summaries)
    for summary in summaries:
        print(
            f"{summary['mode']:>5} {summary['profile']:>8} x{summary['level']:<2} "
            f"accept_p95_real={summary['accept_p95_real_s']:.2f}s "
            f"ready_p95_real={summary['ready_p95_real_s']:.0f}s "
            f"delivered={summary['delivered_share']:.1%} lost={summary['lost']} "
            f"dup={summary['duplicated']} h1={summary['meets_h1']}"
        )


if __name__ == "__main__":
    main()
