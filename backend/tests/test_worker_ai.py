import asyncio
from uuid import uuid4

import pytest

from app import worker
from app.queue import complete_job, enqueue
from tests.conftest import worker_context


@pytest.mark.parametrize("kind", worker.AI_KINDS)
def test_every_ai_kind_blocks_the_whole_group(kind):
    limits = {worker.WORK_ANALYSIS_JOB: 1}
    assert set(worker.full_kinds([kind, "send_email"], limits)) == set(worker.AI_KINDS)
    assert worker.full_kinds(["send_email", "delete_files"], limits) == ()


async def test_two_workers_share_one_slot_each_while_mail_and_cleanup_continue(
    sessions, test_settings, monkeypatch
):
    settings = test_settings.model_copy(update={"poll_seconds": 0.01})
    started = asyncio.Event()
    background = asyncio.Event()
    release = asyncio.Event()
    finished = asyncio.Event()
    active = 0
    peak = 0
    processed = []
    background_kinds = {worker.SEND_EMAIL_JOB, worker.DELETE_FILES_JOB}

    async def handler(context, job):
        nonlocal active, peak
        if job.kind in worker.AI_KINDS:
            active += 1
            peak = max(peak, active)
            if active == 2:
                started.set()
            await release.wait()
            active -= 1
        processed.append(job.kind)
        async with context.sessions() as session:
            await complete_job(session, job.id)
            await session.commit()
        if background_kinds <= set(processed):
            background.set()
        if len(processed) == 8:
            finished.set()

    for kind in (*worker.AI_KINDS, *background_kinds):
        monkeypatch.setitem(worker.HANDLERS, kind, handler)
    async with sessions() as session:
        for kind in (*worker.AI_KINDS, *worker.AI_KINDS, *background_kinds):
            await enqueue(session, kind, uuid4(), 1)
        await session.commit()
    contexts = [worker_context(sessions, settings) for _ in range(2)]
    tasks = [asyncio.create_task(worker.run_worker(context)) for context in contexts]
    try:
        await asyncio.wait_for(started.wait(), 10)
        await asyncio.wait_for(background.wait(), 10)
        assert peak == active == 2
        assert not any(kind in worker.AI_KINDS for kind in processed)
        release.set()
        await asyncio.wait_for(finished.wait(), 10)
        assert peak == 2
        assert all(processed.count(kind) == 2 for kind in worker.AI_KINDS)
    finally:
        release.set()
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
