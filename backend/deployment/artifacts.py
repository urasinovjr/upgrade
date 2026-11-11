import argparse
import gzip
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

from deployment.compose import digest
from deployment.protocol import PREFIX, SERVICES

REPOSITORY = "urasinovjr/upgrade"


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout.strip()


def validate_origin(manifest, sha, run_id):
    expected = {
        "repository": REPOSITORY,
        "sha": sha,
        "run_id": str(run_id),
        "event": os.environ["GITHUB_EVENT_NAME"],
        "branch": "main",
    }
    if (
        os.environ["GITHUB_EVENT_NAME"] not in {"push", "workflow_dispatch"}
        or os.environ["GITHUB_REF_NAME"] != "main"
        or os.environ["GITHUB_REPOSITORY"] != REPOSITORY
        or any(manifest.get(key) != value for key, value in expected.items())
    ):
        raise ValueError("Release artifact provenance mismatch")


def create(directory):
    sha = os.environ["GITHUB_SHA"]
    images = {}
    for service in SERVICES:
        tag = f"{PREFIX}-{service}:{sha}"
        info = json.loads(run("docker", "image", "inspect", tag))[0]
        if info["Config"]["Labels"]["org.opencontainers.image.revision"] != sha:
            raise ValueError("Image revision mismatch")
        images[service] = {"tag": tag, "id": info["Id"]}
    with (
        gzip.open(directory / "images.tar.gz", "wb", compresslevel=1) as target,
        subprocess.Popen(
            ["docker", "save", *[item["tag"] for item in images.values()]], stdout=subprocess.PIPE
        ) as process,
    ):
        shutil.copyfileobj(process.stdout, target)
        if process.wait():
            raise ValueError("Docker image export failed")
    manifest = {
        "format": 1,
        "repository": os.environ["GITHUB_REPOSITORY"],
        "sha": sha,
        "run_id": os.environ["GITHUB_RUN_ID"],
        "event": os.environ["GITHUB_EVENT_NAME"],
        "branch": os.environ["GITHUB_REF_NAME"],
        "images": images,
        "sha256": digest(directory / "images.tar.gz"),
    }
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


def verify(directory, sha):
    manifest = json.loads((directory / "manifest.json").read_text())
    if (
        manifest.get("format") != 1
        or not re.fullmatch(r"[0-9a-f]{40}", sha)
        or manifest.get("sha") != sha
        or manifest.get("repository") != REPOSITORY
        or set(manifest.get("images", {})) != set(SERVICES)
        or digest(directory / "images.tar.gz") != manifest.get("sha256")
    ):
        raise ValueError("Invalid release manifest or archive checksum")
    for service, item in manifest["images"].items():
        if item.get("tag") != f"{PREFIX}-{service}:{sha}" or not re.fullmatch(
            r"sha256:[0-9a-f]{64}", item.get("id", "")
        ):
            raise ValueError("Invalid release image identity")
    return manifest


def load(directory, sha):
    manifest = verify(directory, sha)
    run("docker", "load", "-i", str(directory / "images.tar.gz"))
    for item in manifest["images"].values():
        info = json.loads(run("docker", "image", "inspect", item["tag"]))[0]
        if (
            info["Id"] != item["id"]
            or info["Config"].get("Labels", {}).get("org.opencontainers.image.revision") != sha
        ):
            raise ValueError("Loaded image differs from tested image")
    return manifest


def publish(directory, sha, run_id):
    manifest = verify(directory, sha)
    validate_origin(manifest, sha, run_id)
    head = json.loads(run("gh", "api", f"repos/{REPOSITORY}/git/ref/heads/main"))
    if head["object"]["sha"] != sha:
        raise ValueError("Refusing to publish a stale revision")
    load(directory, sha)
    images = {}
    for service, item in manifest["images"].items():
        subprocess.run(["docker", "push", item["tag"]], check=True)
        remote = json.loads(run("docker", "buildx", "imagetools", "inspect", item["tag"], "--raw"))
        if remote.get("config", {}).get("digest") != item["id"]:
            raise ValueError("Published image config differs from tested image")
        inspection = json.loads(
            run(
                "docker",
                "buildx",
                "imagetools",
                "inspect",
                item["tag"],
                "--format",
                "{{json .Manifest}}",
            )
        )
        images[service] = f"{PREFIX}-{service}@{inspection['digest']}"
    (directory / "published.json").write_text(json.dumps(images, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("create", "load", "publish"))
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    if args.action == "create":
        create(args.directory)
    elif args.action == "load":
        load(args.directory, os.environ["GITHUB_SHA"])
    else:
        publish(args.directory, os.environ["GITHUB_SHA"], os.environ["GITHUB_RUN_ID"])


if __name__ == "__main__":
    main()
