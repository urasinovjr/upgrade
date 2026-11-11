import re

PREFIX = "ghcr.io/urasinovjr/upgrade"
SERVICES = ("backend", "frontend")


class ReleaseRefused(ValueError):
    pass


def validate(payload: dict) -> dict:
    if not isinstance(payload, dict) or set(payload) != {"sha", "images", "token"}:
        raise ReleaseRefused("Invalid release request")
    if not isinstance(payload["sha"], str) or not re.fullmatch(r"[a-f0-9]{40}", payload["sha"]):
        raise ReleaseRefused("Invalid commit")
    images = payload["images"]
    if not isinstance(images, dict) or set(images) != set(SERVICES):
        raise ReleaseRefused("Missing image digests")
    for service, image in images.items():
        pattern = re.escape(f"{PREFIX}-{service}@sha256:") + r"[a-f0-9]{64}"
        if not isinstance(image, str) or not re.fullmatch(pattern, image):
            raise ReleaseRefused("Invalid image digest")
    token = payload["token"]
    if not isinstance(token, str) or not token or not all(33 <= ord(c) <= 126 for c in token):
        raise ReleaseRefused("Invalid registry token")
    return payload
