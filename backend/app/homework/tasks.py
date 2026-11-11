import time
from datetime import UTC, datetime
from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy import select

from app.analysis.contract import InvalidReply
from app.analysis.names import hidden_text, name_forms, name_places, student_names
from app.analysis.openrouter import FINAL_ERRORS
from app.config import Settings
from app.errors import DomainError
from app.events import provider_source, record_event
from app.files import StorageError
from app.homework.models import Homework, HomeworkFile, HomeworkJob
from app.homework.prompts import VERSION, ConditionsAnswer
from app.homework.schemas import HomeworkTask, MaterialContent, MaterialIn, RecognizeIn
from app.knowledge.catalog import CATALOG_VERSION, KNOWN_TOPICS
from app.knowledge.task_types import TASK_TYPE_IDS
from app.provider import ProviderError
from app.queue import Job, JobFailure, WorkerContext, complete_job, enqueue
from app.redaction import PageUnreadable, SourceFile, sanitize_pages
from app.students.models import Student
from app.works.models import Work, WorkRevision
from app.works.schemas import Draft, Task
from app.works.service import dump, owned_work

RECOGNIZE_JOB = "condition_recognition"
MATERIAL_JOB = "remediation"


def job_out(job: HomeworkJob) -> dict:
    return {
        "id": str(job.id),
        "kind": job.kind,
        "status": job.status,
        "revision": job.revision,
        "result": job.result,
        "provenance": job.provenance,
    }


async def queue_task(session, settings, task):
    session.add(task)
    await session.flush()
    job = await enqueue(session, task.kind, task.id, settings.job_attempts)
    task.job_id = job.id
    await record_event(
        session,
        task.teacher_id,
        task.kind + "_queued",
        task.id,
        source=provider_source(settings.analysis_variant),
    )
    await session.commit()
    return task


async def enqueue_recognition(session, settings: Settings, homework: Homework, data: RecognizeIn):
    existing = await session.scalar(
        select(HomeworkJob)
        .where(
            HomeworkJob.homework_id == homework.id,
            HomeworkJob.kind == RECOGNIZE_JOB,
            HomeworkJob.revision == homework.revision,
            HomeworkJob.status == "queued",
        )
        .order_by(HomeworkJob.created_at.desc())
        .limit(1)
    )
    if existing is not None and existing.input == dump(data):
        return existing
    files = list(
        await session.scalars(
            select(HomeworkFile)
            .where(HomeworkFile.homework_id == homework.id, HomeworkFile.id.in_(data.file_ids))
            .order_by(HomeworkFile.name, HomeworkFile.id)
        )
    )
    if {file.id for file in files} != set(data.file_ids):
        raise DomainError("attachments_mismatch")
    unchecked = [
        {"fileId": str(file.id), "page": page}
        for file in files
        for page in range(1, file.pages + 1)
        if page not in file.checked_pages
    ]
    if unchecked:
        raise DomainError("redaction_unchecked", {"pages": unchecked})
    if not files and not data.text.strip():
        raise DomainError("work_meta_invalid")
    if sum(file.size for file in files) > settings.analysis_max_bytes:
        raise DomainError("analysis_too_large")
    students = await session.scalars(
        select(Student).where(Student.teacher_id == homework.teacher_id)
    )
    for student in students:
        probe = Task(
            id="condition",
            title="Условие",
            condition=data.text,
            formula="",
            reference="",
            topic_id="",
            steps=[],
            feedback="",
            reviewed=False,
            omitted=False,
        )
        if name_places(student_names(student), [probe]):
            raise DomainError("name_in_text")
    return await queue_task(
        session,
        settings,
        HomeworkJob(
            teacher_id=homework.teacher_id,
            homework_id=homework.id,
            kind=RECOGNIZE_JOB,
            revision=homework.revision,
            status="queued",
            input=dump(data),
        ),
    )


async def enqueue_material(session, settings, teacher_id: UUID, data: MaterialIn):
    work = await owned_work(session, teacher_id, data.work_id, lock=True)
    revision = (
        await session.get(WorkRevision, work.current_revision_id)
        if work.current_revision_id
        else None
    )
    draft = Draft.model_validate(revision.draft) if revision else None
    task = next((task for task in draft.tasks if task.id == data.task_id), None) if draft else None
    if task is None or task.gap is None or task.gap.decision != "confirmed":
        raise DomainError("gap_unconfirmed")
    student = await session.get(Student, work.student_id)
    reason = hidden_text(task.gap.reason, name_forms(student_names(student)))
    return await queue_task(
        session,
        settings,
        HomeworkJob(
            teacher_id=teacher_id,
            work_id=work.id,
            kind=MATERIAL_JOB,
            revision=1,
            status="queued",
            input={
                "topicId": task.gap.topic_id,
                "reason": reason,
                "revisionId": str(revision.id),
            },
        ),
    )


async def condition_pages(context, task):
    from app.homework.submissions import read_object

    async with context.sessions() as session:
        files = list(
            await session.scalars(
                select(HomeworkFile).where(
                    HomeworkFile.homework_id == task.homework_id,
                    HomeworkFile.id.in_([UUID(value) for value in task.input["fileIds"]]),
                )
            )
        )
    sources = [
        SourceFile(
            file_id=str(file.id),
            content_type=file.content_type,
            data=await read_object(context.storage, file.storage_key),
            page_order=list(range(1, file.pages + 1)),
            masks=file.masks,
        )
        for file in files
    ]
    return await sanitize_pages(
        context.storage, context.settings, task.teacher_id, task.id, sources
    )


def recognized_conditions(raw, files):
    answer = ConditionsAnswer.model_validate(raw)
    if not 1 <= len(answer.tasks) <= 100:
        raise InvalidReply("task_count")
    result = []
    for item in answer.tasks:
        if item.topic_id and item.topic_id not in KNOWN_TOPICS:
            raise InvalidReply("topic")
        if item.task_type_id and item.task_type_id not in TASK_TYPE_IDS:
            raise InvalidReply("task_type")
        if not set(item.file_ids) <= set(files):
            raise InvalidReply("files")
        task = HomeworkTask(
            id=uuid4(),
            title=item.title,
            condition=item.condition,
            formula=item.formula,
            topic_id=item.topic_id,
            task_type_id=item.task_type_id,
            condition_file_ids=item.file_ids,
            exam=item.exam.model_dump() if item.exam else None,
            confirmed=False,
        )
        result.append(dump(task))
    return {"tasks": result}


async def source_is_current(session, task, lock=False):
    if task.homework_id:
        homework = await session.get(Homework, task.homework_id, with_for_update=lock)
        return (
            homework is not None and homework.revision == task.revision and not homework.assigned_at
        )
    work = await session.get(Work, task.work_id, with_for_update=lock)
    return work is not None and str(work.current_revision_id) == task.input.get("revisionId")


async def save_call(context, job, reply, error=None):
    async with context.sessions() as session:
        task = await session.get(HomeworkJob, job.subject_id, with_for_update=True)
        if task is not None and task.job_id == job.id:
            provenance = dict(task.provenance or {})
            calls = list(provenance.get("providerCalls", []))
            calls.append({**reply.call_metadata(), "attempt": job.attempts, "error": error})
            task.provenance = {**provenance, "providerCalls": calls}
            await session.commit()


async def handle_homework_task(context: WorkerContext, job: Job):
    started = time.monotonic()
    queued_ms = max(0, round((datetime.now(UTC) - job.run_after).total_seconds() * 1000))
    async with context.sessions() as session:
        task = await session.get(HomeworkJob, job.subject_id)
        if task is None or task.job_id != job.id or task.status != "queued":
            await complete_job(session, job.id)
            await session.commit()
            return
        if not await source_is_current(session, task):
            task.status = "stale"
            await record_event(
                session,
                task.teacher_id,
                task.kind + "_stale",
                task.id,
                source=provider_source(context.analysis_variant.name),
            )
            await complete_job(session, job.id)
            await session.commit()
            return
    try:
        if task.kind == RECOGNIZE_JOB:
            pages = await condition_pages(context, task)
            reply = await context.analysis_provider.recognize_conditions(
                task.input["text"], pages.pages
            )
            await save_call(context, job, reply)
            result = recognized_conditions(reply.raw, task.input["fileIds"])
            sent = pages.sent
        else:
            reply = await context.analysis_provider.generate_material(
                task.input["topicId"], task.input["reason"]
            )
            await save_call(context, job, reply)
            result = dump(MaterialContent.model_validate(reply.raw))
            sent = []
    except ProviderError as error:
        if error.reply is not None:
            await save_call(context, job, error.reply, error.code)
        raise JobFailure(
            error.code,
            retryable=error.code not in FINAL_ERRORS,
            deferred=error.code == "provider_rate_limited",
        ) from error
    except StorageError as error:
        raise JobFailure(error.code) from error
    except PageUnreadable as error:
        await finish_failed(context, job, "needs_input", error.code)
        return
    except (ValidationError, InvalidReply) as error:
        raise JobFailure("provider_invalid_response") from error
    async with context.sessions() as session:
        current = await source_is_current(session, task, lock=True)
        stored = await session.get(HomeworkJob, task.id, with_for_update=True)
        if stored is None or stored.job_id != job.id:
            await complete_job(session, job.id)
            await session.commit()
            return
        stored.status = "ready" if current else "stale"
        stored.result = result
        stored.provenance = {
            **(stored.provenance or {}),
            "provider": reply.provider,
            "model": reply.model,
            "promptVersion": reply.prompt_version,
            "homeworkPromptVersion": VERSION,
            "variant": context.analysis_variant.name,
            "actualCostUsd": str(reply.actual_cost_usd)
            if reply.actual_cost_usd is not None
            else None,
            "inputTokens": reply.input_tokens,
            "outputTokens": reply.output_tokens,
            "catalogVersion": CATALOG_VERSION,
            "codeCommit": context.code_commit,
            "input": task.input,
            "raw": reply.raw,
            "sentPages": sent,
            "processingMs": round((time.monotonic() - started) * 1000),
            "queuedMs": queued_ms,
            "estimatedCost": str(
                (
                    reply.input_tokens * context.analysis_variant.price_input_per_mtok
                    + reply.output_tokens * context.analysis_variant.price_output_per_mtok
                )
                / 1_000_000
            ),
            "costCurrency": context.analysis_variant.currency,
            "costBasis": "configured_token_tariff",
        }
        await record_event(
            session,
            stored.teacher_id,
            stored.kind + "_" + stored.status,
            stored.id,
            source=provider_source(context.analysis_variant.name),
        )
        await complete_job(session, job.id)
        await session.commit()


async def finish_failed(context, job, status, error):
    async with context.sessions() as session:
        task = await session.get(HomeworkJob, job.subject_id, with_for_update=True)
        if task is not None and task.job_id == job.id:
            task.status = status
            task.provenance = {**(task.provenance or {}), "error": error}
            await record_event(
                session,
                task.teacher_id,
                task.kind + "_" + status,
                task.id,
                source=provider_source(context.analysis_variant.name),
            )
        if status == "needs_input":
            await complete_job(session, job.id)
        await session.commit()


async def mark_homework_failed(context: WorkerContext, job: Job):
    await finish_failed(context, job, "failed", job.last_error)
