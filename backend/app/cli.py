import argparse
import asyncio
import sys
from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from typing import BinaryIO

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.access.accounts import find_user_by_email
from app.analysis.corrections_report import corrections_report
from app.analysis.providers import ProviderNotConfigured, make_provider
from app.analysis.report import Period, analysis_report
from app.analysis.variants import UnknownVariant, get_variant
from app.billing import grant_subscription, upsert_plan
from app.config import Settings
from app.database import make_engine, make_session_factory
from app.errors import DomainError
from app.evaluation import (
    AcceptanceRun,
    IncompleteMarks,
    compare,
    load_manifest,
    run_split,
    score,
    validate,
)
from app.files import S3Storage
from app.files.archive import ArchiveRefused, export_objects, import_objects
from app.knowledge.catalog import catalog_json, catalog_problems
from app.knowledge.export import catalog_diff, write_catalog_xlsx
from app.operations import (
    database_problems,
    mail_problems,
    provider_problems,
    storage_problems,
    verify_backup,
)
from app.timing import enroll, leave
from app.timing.report import timing_report

Command = Callable[[AsyncSession, argparse.Namespace], Awaitable[str]]
FileCommand = Callable[[argparse.Namespace, Settings], Awaitable[str]]
CATALOG_JSON = Path(__file__).resolve().parents[2] / "frontend/src/data/catalog.json"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)

    plan = commands.add_parser("plan-upsert", help="create or update a plan")
    plan.add_argument("--code", required=True)
    plan.add_argument("--title", required=True)
    plan.add_argument("--price-minor", type=int, required=True)
    plan.add_argument("--currency", default="RUB")
    plan.add_argument("--days", type=int, default=30)
    plan.add_argument("--inactive", action="store_true")

    grant = commands.add_parser("grant-subscription", help="extend a teacher subscription")
    grant.add_argument("--email", required=True)
    grant.add_argument("--plan", required=True)
    grant.add_argument("--days", type=int)
    grant.add_argument("--note", default="")

    report = commands.add_parser("analysis-report", help="timings, failures and cost of runs")
    report.add_argument("--since", type=date.fromisoformat)
    report.add_argument("--until", type=date.fromisoformat)
    report.add_argument("--csv", action="store_true")

    pilot = commands.add_parser("pilot-enroll", help="turn time measurement on for a teacher")
    pilot.add_argument("--email", required=True)
    pilot.add_argument("--note", default="")
    pilot.add_argument("--remove", action="store_true")

    timing = commands.add_parser("timing-report", help="active review time and savings")
    timing.add_argument("--since", type=date.fromisoformat)
    timing.add_argument("--until", type=date.fromisoformat)
    timing.add_argument("--csv", action="store_true")

    edits = commands.add_parser("corrections-report", help="teacher corrections of AI drafts")
    edits.add_argument("--since", type=date.fromisoformat)
    edits.add_argument("--until", type=date.fromisoformat)
    edits.add_argument("--csv", action="store_true")
    edits.add_argument("--pilot", action="store_true", help="only pilot participants")

    check = commands.add_parser("eval-validate", help="check a control set before a run")
    check.add_argument("--root", type=Path, required=True)
    check.add_argument("--names", type=Path, help="file with student names, one per line")

    evaluate = commands.add_parser("eval-run", help="run the pipeline on a control set split")
    evaluate.add_argument("--root", type=Path, required=True)
    evaluate.add_argument("--split", choices=["dev", "acceptance"], required=True)
    evaluate.add_argument("--out", type=Path, required=True)
    evaluate.add_argument("--variant", help="analysis variant, ANALYSIS_VARIANT by default")

    scoring = commands.add_parser("eval-score", help="compute quality metrics from expert marks")
    scoring.add_argument("--out", type=Path, required=True)

    versus = commands.add_parser("eval-compare", help="compare variant runs on the dev split")
    versus.add_argument("outs", type=Path, nargs="+")
    versus.add_argument("--report", type=Path, required=True)

    catalog = commands.add_parser("catalog-json", help="write the topic catalog for the frontend")
    catalog.add_argument("--out", type=Path, default=CATALOG_JSON)

    export = commands.add_parser("catalog-export", help="write the topic catalog for an expert")
    export.add_argument("--out", type=Path, required=True)

    diff = commands.add_parser("catalog-diff", help="show expert edits in a catalog workbook")
    diff.add_argument("--xlsx", type=Path, required=True)

    dump = commands.add_parser("storage-export", help="write every stored file into a tar")
    dump.add_argument("--out", required=True, help="file path or - for stdout")

    load = commands.add_parser("storage-import", help="load a tar into an empty bucket")
    load.add_argument("--file", required=True, help="file path or - for stdin")

    commands.add_parser("backup-verify", help="check that every referenced file is stored")
    commands.add_parser("preflight", help="check production settings and services")
    return parser


def period_of(args: argparse.Namespace) -> Period:
    since = datetime.combine(args.since, time(), UTC) if args.since else None
    until = datetime.combine(args.until + timedelta(days=1), time(), UTC) if args.until else None
    return Period(since, until)


async def save_plan(session: AsyncSession, args: argparse.Namespace) -> str:
    await upsert_plan(
        session,
        args.code,
        args.title,
        args.price_minor,
        args.currency,
        args.days,
        not args.inactive,
    )
    await session.commit()
    return f"plan {args.code} saved"


async def extend_subscription(session: AsyncSession, args: argparse.Namespace) -> str:
    user = await find_user_by_email(session, args.email)
    if user is None:
        raise DomainError("user_not_found")
    subscription = await grant_subscription(session, user.id, args.plan, args.days, args.note)
    await session.commit()
    return f"subscription for {user.email} ends {subscription.ends_at.isoformat()}"


async def report_runs(session: AsyncSession, args: argparse.Namespace) -> str:
    return await analysis_report(session, period_of(args), args.csv)


async def enroll_teacher(session: AsyncSession, args: argparse.Namespace) -> str:
    user = await find_user_by_email(session, args.email)
    if user is None:
        raise DomainError("user_not_found")
    if args.remove:
        await leave(session, user.id)
    else:
        await enroll(session, user.id, args.note)
    await session.commit()
    return f"time measurement for {user.email} is {'off' if args.remove else 'on'}"


async def report_timing(session: AsyncSession, args: argparse.Namespace) -> str:
    period = period_of(args)
    return await timing_report(session, period.since, period.until, args.csv)


async def report_corrections(session: AsyncSession, args: argparse.Namespace) -> str:
    return await corrections_report(session, period_of(args), args.pilot, args.csv)


def names_of(path: Path | None) -> list[str]:
    if path is None:
        return []
    return [line.strip() for line in path.read_text("utf-8").splitlines() if line.strip()]


async def check_control_set(args: argparse.Namespace, settings: Settings) -> str:
    problems, warnings = validate(load_manifest(args.root), args.root, names_of(args.names))
    lines = [f"ошибка: {item}" for item in problems] + [f"внимание: {item}" for item in warnings]
    if problems:
        raise SystemExit("\n".join(lines))
    return "\n".join([*lines, "набор готов к прогону"])


async def run_control_set(args: argparse.Namespace, settings: Settings) -> str:
    manifest = load_manifest(args.root)
    problems, _ = validate(manifest, args.root, [])
    if problems:
        raise SystemExit("\n".join(f"ошибка: {item}" for item in problems))
    try:
        variant = get_variant(args.variant or settings.analysis_variant)
        provider = make_provider(variant, settings)
    except UnknownVariant as error:
        raise SystemExit(f"неизвестный вариант разбора: {error.name}") from error
    except ProviderNotConfigured as error:
        raise SystemExit(str(error)) from error
    try:
        message = await run_split(
            manifest, args.root, args.split, args.out, provider, settings, variant
        )
    finally:
        await provider.close()
    if args.split == "acceptance" and variant.name != settings.analysis_variant:
        message += (
            f"\nвнимание: контрольный набор прогнан вариантом {variant.name}, "
            f"а зафиксирован {settings.analysis_variant}"
        )
    return message


async def compare_runs(args: argparse.Namespace, settings: Settings) -> str:
    try:
        return compare(args.outs, args.report)
    except AcceptanceRun as error:
        raise SystemExit(
            f"{error.out}: сравнивать можно только прогоны набора для разработки"
        ) from error


async def score_control_set(args: argparse.Namespace, settings: Settings) -> str:
    try:
        return score(args.out)
    except IncompleteMarks as error:
        raise SystemExit("не заполнены оценки эксперта: " + ", ".join(error.rows)) from error


def checked_catalog() -> None:
    problems = catalog_problems()
    if problems:
        raise SystemExit("\n".join(f"ошибка: {item}" for item in problems))


async def write_catalog(args: argparse.Namespace, settings: Settings) -> str:
    checked_catalog()
    args.out.write_text(catalog_json(), "utf-8")
    return f"справочник записан в {args.out}"


async def export_catalog(args: argparse.Namespace, settings: Settings) -> str:
    checked_catalog()
    write_catalog_xlsx(args.out)
    return f"таблица для эксперта записана в {args.out}"


async def diff_catalog(args: argparse.Namespace, settings: Settings) -> str:
    lines = catalog_diff(args.xlsx)
    return "\n".join(lines) if lines else "правок нет"


def opened(path: str, mode: str) -> BinaryIO:
    if path == "-":
        return sys.stdout.buffer if "w" in mode else sys.stdin.buffer
    return Path(path).open(mode)


async def export_storage(args: argparse.Namespace, settings: Settings) -> str:
    storage = await S3Storage.connect(settings)
    try:
        target = opened(args.out, "wb")
        count = await export_objects(storage, target)
        target.flush()
    finally:
        await storage.close()
    print(f"файлов выгружено: {count}", file=sys.stderr)
    return ""


async def import_storage(args: argparse.Namespace, settings: Settings) -> str:
    storage = await S3Storage.connect(settings)
    try:
        count = await import_objects(storage, opened(args.file, "rb"))
    except ArchiveRefused as error:
        raise SystemExit(f"загрузка остановлена: {error.reason}") from error
    finally:
        await storage.close()
    return f"файлов загружено: {count}"


async def with_services(settings: Settings, check: Callable) -> list[str]:
    engine = make_engine(settings.database_url)
    storage = await S3Storage.connect(settings)
    try:
        async with make_session_factory(engine)() as session:
            return await check(session, storage)
    finally:
        await storage.close()
        await engine.dispose()


async def check_backup(args: argparse.Namespace, settings: Settings) -> str:
    async def verify(session: AsyncSession, storage) -> list[str]:
        counts, problems = await verify_backup(session, storage)
        if problems:
            raise SystemExit("\n".join(counts + problems))
        return counts

    return "\n".join([*await with_services(settings, verify), "резервная копия полная"])


async def check_services(args: argparse.Namespace, settings: Settings) -> str:
    async def services(session: AsyncSession, storage) -> list[str]:
        return await database_problems(session) + await storage_problems(storage)

    problems = await with_services(settings, services)
    problems += await provider_problems(settings) + await mail_problems(settings)
    if problems:
        raise SystemExit("\n".join(f"ошибка: {item}" for item in problems))
    return f"готово к работе: {settings.app_env}, {settings.public_url}"


FILE_COMMANDS: dict[str, FileCommand] = {
    "eval-validate": check_control_set,
    "eval-run": run_control_set,
    "eval-score": score_control_set,
    "eval-compare": compare_runs,
    "catalog-json": write_catalog,
    "catalog-export": export_catalog,
    "catalog-diff": diff_catalog,
    "storage-export": export_storage,
    "storage-import": import_storage,
    "backup-verify": check_backup,
    "preflight": check_services,
}

COMMANDS: dict[str, Command] = {
    "plan-upsert": save_plan,
    "grant-subscription": extend_subscription,
    "analysis-report": report_runs,
    "pilot-enroll": enroll_teacher,
    "timing-report": report_timing,
    "corrections-report": report_corrections,
}


async def run(argv: list[str], settings: Settings) -> str:
    args = build_parser().parse_args(argv)
    if args.command in FILE_COMMANDS:
        return await FILE_COMMANDS[args.command](args, settings)
    engine = make_engine(settings.database_url)
    try:
        async with make_session_factory(engine)() as session:
            return await COMMANDS[args.command](session, args)
    finally:
        await engine.dispose()


def main() -> None:
    try:
        settings = Settings()
    except ValidationError as error:
        raise SystemExit(f"ошибка настроек: {error.errors()[0]['msg']}") from error
    try:
        message = asyncio.run(run(sys.argv[1:], settings))
    except DomainError as error:
        print(f"error: {error.code}", file=sys.stderr)
        sys.exit(1)
    if message:
        print(message)


if __name__ == "__main__":
    main()
