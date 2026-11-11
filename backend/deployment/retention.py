import json
import shutil
import subprocess
from pathlib import Path

from deployment.runtime import PROJECT, ROOT, metadata, run


def backups() -> None:
    for kind, count in (("daily", 7), ("prerelease", 2)):
        copies = sorted((ROOT / "backups").glob(f"{kind}-*"), reverse=True)
        complete = [path for path in copies if (path / "manifest.json").is_file()]
        for path in complete[count:]:
            shutil.rmtree(path)


def cleanup(current: Path, previous: Path | None) -> None:
    keep = {path for path in (current, previous) if path is not None}
    kept_images = {image for path in keep for image in metadata(path)["images"].values()}
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
    ).stdout.split()
    if stopped:
        run(["docker", "rm", *stopped])
    for path in (ROOT / "releases").iterdir():
        if not path.is_dir() or path in keep:
            continue
        for image in metadata(path)["images"].values():
            if image not in kept_images:
                subprocess.run(
                    ["docker", "image", "rm", image],
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
        shutil.rmtree(path)
    backups()


def manifest(destination: Path, sha: str, files: dict) -> None:
    (destination / "manifest.json").write_text(json.dumps({"release": sha, "files": files}))
