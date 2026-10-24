import asyncio
import json
import time

import httpx

from loadgen.scenario import (
    CLIENT_ATTEMPTS,
    CLIENT_RETRY_PAUSE,
    CLIENT_TIMEOUT,
    IDEM_RETRY_SECONDS,
    POLL_INTERVAL,
    POLL_LIMIT_SECONDS,
    Upload,
)

SUCCESS = {"sync": 200, "async": 202, "sync-idem": 200}
RETRY_STATUSES = {502, 503, 504}
IN_PROGRESS = 409
FINAL_JOB_STATUSES = {"done", "failed"}


def request_for(mode: str, upload: Upload) -> tuple[str, dict, dict]:
    body = {"teacher_id": upload.teacher_id, "student_id": upload.student_id, "pages": upload.pages}
    if mode == "sync":
        return "/sync/works", body, {"X-Upload-Id": upload.upload_id}
    if mode == "sync-idem":
        headers = {"X-Upload-Id": upload.upload_id, "Idempotency-Key": upload.upload_id}
        return "/sync/works", body, headers
    return "/works", body, {"Idempotency-Key": upload.upload_id}


async def send_once(
    http: httpx.AsyncClient, mode: str, upload: Upload, page: bytes | None = None
) -> tuple[str, dict | None]:
    path, body, headers = request_for(mode, upload)
    try:
        if page is None:
            response = await http.post(path, json=body, headers=headers, timeout=CLIENT_TIMEOUT)
        else:
            files = [("pages", (f"{number}.bin", page)) for number in range(upload.pages)]
            response = await http.post(
                path + "/upload",
                data={"meta": json.dumps(body)},
                files=files,
                headers=headers,
                timeout=CLIENT_TIMEOUT,
            )
    except httpx.TimeoutException:
        return "timeout", None
    except httpx.HTTPError:
        return "connection_error", None
    data = response.json() if response.status_code in (200, 202) else None
    return str(response.status_code), data


async def poll_job(http: httpx.AsyncClient, job_id: str, first_send: float) -> dict:
    deadline = time.time() + POLL_LIMIT_SECONDS
    polls = 0
    status = ""
    while time.time() < deadline:
        await asyncio.sleep(POLL_INTERVAL)
        polls += 1
        try:
            response = await http.get(f"/jobs/{job_id}", timeout=CLIENT_TIMEOUT)
        except httpx.HTTPError:
            continue
        if response.status_code != 200:
            continue
        status = response.json()["status"]
        if status in FINAL_JOB_STATUSES:
            break
    ready = time.time() - first_send if status == "done" else None
    return {"polled_ready_s": ready, "poll_count": polls, "job_status": status}


async def send_upload(
    http: httpx.AsyncClient, mode: str, upload: Upload, started: float, page: bytes | None = None
) -> dict:
    await asyncio.sleep(max(0.0, started + upload.start_at - time.time()))
    first_send = time.time()
    patience = first_send + IDEM_RETRY_SECONDS
    outcome = ""
    data = None
    accept_seconds = None
    attempts = 0
    failures = 0
    while failures < CLIENT_ATTEMPTS:
        attempts += 1
        outcome, data = await send_once(http, mode, upload, page)
        if outcome == str(SUCCESS[mode]):
            accept_seconds = time.time() - first_send
            break
        waiting = outcome == str(IN_PROGRESS) and mode == "sync-idem"
        if waiting and time.time() < patience:
            await asyncio.sleep(CLIENT_RETRY_PAUSE)
            continue
        failures += 1
        if outcome.isdigit() and int(outcome) not in RETRY_STATUSES:
            break
        if failures < CLIENT_ATTEMPTS:
            await asyncio.sleep(CLIENT_RETRY_PAUSE)
    row = {
        "upload_id": upload.upload_id,
        "pages": upload.pages,
        "first_send": first_send,
        "attempts": attempts,
        "last_outcome": outcome,
        "accepted": accept_seconds is not None,
        "accept_s": accept_seconds,
        "polled_ready_s": accept_seconds,
        "poll_count": 0,
        "job_status": "",
    }
    if mode == "async" and data is not None:
        row |= await poll_job(http, data["id"], first_send)
    return row
