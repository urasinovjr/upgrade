import argparse
import json
import os
import subprocess
import tempfile
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--images", type=Path)
    parser.add_argument("--monitor", action="store_true")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        key = root / "identity"
        key.write_text(os.environ["DEPLOY_KEY"] + "\n")
        key.chmod(0o600)
        hosts = root / "known_hosts"
        hosts.write_text(os.environ["DEPLOY_KNOWN_HOSTS"] + "\n")
        operation = "monitor" if args.monitor else "deploy"
        payload = ""
        if not args.monitor:
            images = json.loads(args.images.read_text())
            payload = json.dumps(
                {
                    "sha": os.environ["RELEASE_SHA"],
                    "images": images,
                    "token": os.environ["GH_TOKEN"],
                }
            )
        subprocess.run(
            [
                "ssh",
                "-i",
                str(key),
                "-o",
                "IdentitiesOnly=yes",
                "-o",
                "BatchMode=yes",
                "-o",
                "StrictHostKeyChecking=yes",
                "-o",
                f"UserKnownHostsFile={hosts}",
                "-o",
                "ConnectTimeout=15",
                "upgrade-deploy@193.233.218.52",
                operation,
            ],
            input=payload,
            text=True,
            check=True,
            timeout=900,
        )


if __name__ == "__main__":
    main()
