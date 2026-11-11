import json
import shutil
import socket
import ssl
import subprocess
from datetime import UTC, datetime

from deployment.runtime import ROOT, active, compose, run


def monitor() -> dict:
    release = active()
    if release is None:
        raise RuntimeError("No active release")
    result = compose(release, "ps", "--format", "json", capture_output=True, text=True)
    entries = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
    if len(entries) == 1 and isinstance(entries[0], list):
        entries = entries[0]
    running = [row for row in entries if row["Service"] != "migrate"]
    assert {row["Service"] for row in running} == {"db", "s3", "api", "worker", "frontend"}
    assert all(row["State"] == "running" and row.get("Health") == "healthy" for row in running)
    assert len([row for row in running if row["Service"] == "worker"]) == 2
    run(
        [
            "curl",
            "--fail",
            "--silent",
            "--show-error",
            "--max-time",
            "15",
            "https://193.233.218.52/health/ready",
        ],
        stdout=subprocess.DEVNULL,
    )
    context = ssl.create_default_context()
    with (
        socket.create_connection(("193.233.218.52", 443), timeout=10) as connection,
        context.wrap_socket(connection, server_hostname="193.233.218.52") as secured,
    ):
        certificate = secured.getpeercert()
    remaining = ssl.cert_time_to_seconds(certificate["notAfter"]) - datetime.now(UTC).timestamp()
    assert remaining > 86400, "Certificate expires within 24 hours"
    disk = shutil.disk_usage(ROOT)
    assert disk.free > 5 * 1024**3 and disk.free / disk.total > 0.1, "Low disk space"
    copies = list((ROOT / "backups").glob("daily-*/manifest.json"))
    assert copies, "No completed daily backup"
    age = datetime.now(UTC).timestamp() - max(path.stat().st_mtime for path in copies)
    assert age < 30 * 3600, "Daily backup is older than 30 hours"
    report = {
        "sha": release.name,
        "containers": len(running),
        "certificateHours": int(remaining / 3600),
        "diskFreeGiB": round(disk.free / 1024**3, 1),
        "backupAgeHours": round(age / 3600, 1),
    }
    print(json.dumps(report))
    return report


if __name__ == "__main__":
    monitor()
