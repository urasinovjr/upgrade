import asyncio
import time

import httpx

from loadgen.scenario import CLIENT_ATTEMPTS, CLIENT_RETRY_PAUSE, CLIENT_TIMEOUT, Upload

SUCCESS = {"sync": 200, "async": 202}
RETRY_STATUSES = {502, 503, 504}


def request_for(mode: str, upload: Upload) -> tuple[str, dict, dict]:
    body = {"teacher_id": upload.teacher_id, "student_id": upload.student_id, "pages": upload.pages}
    if mode == "sync":
        return "/sync/works", body, {"X-Upload-Id": upload.upload_id}
    return "/works", body, {"Idempotency-Key": upload.upload_id}


async def send_once(http: httpx.AsyncClient, mode: str, upload: Upload) -> str:
    path, body, headers = request_for(mode, upload)
    try:
        response = await http.post(path, json=body, headers=headers, timeout=CLIENT_TIMEOUT)
    except httpx.TimeoutException:
        return "timeout"
    except httpx.HTTPError:
        return "connection_error"
    return str(response.status_code)


async def send_upload(http: httpx.AsyncClient, mode: str, upload: Upload, started: float) -> dict:
    await asyncio.sleep(max(0.0, started + upload.start_at - time.time()))
    first_send = time.time()
    outcome = ""
    accept_seconds = None
    attempts = 0
    while attempts < CLIENT_ATTEMPTS:
        attempts += 1
        outcome = await send_once(http, mode, upload)
        if outcome == str(SUCCESS[mode]):
            accept_seconds = time.time() - first_send
            break
        if outcome.isdigit() and int(outcome) not in RETRY_STATUSES:
            break
        if attempts < CLIENT_ATTEMPTS:
            await asyncio.sleep(CLIENT_RETRY_PAUSE)
    return {
        "upload_id": upload.upload_id,
        "pages": upload.pages,
        "first_send": first_send,
        "attempts": attempts,
        "last_outcome": outcome,
        "accepted": accept_seconds is not None,
        "accept_s": accept_seconds,
    }
