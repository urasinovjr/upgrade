import argparse
import asyncio
import sys
from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.access.accounts import find_user_by_email
from app.analysis.report import Period, analysis_report
from app.billing import grant_subscription, upsert_plan
from app.config import Settings
from app.database import make_engine, make_session_factory
from app.errors import DomainError
from app.timing import enroll, leave
from app.timing.report import timing_report

Command = Callable[[AsyncSession, argparse.Namespace], Awaitable[str]]


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


COMMANDS: dict[str, Command] = {
    "plan-upsert": save_plan,
    "grant-subscription": extend_subscription,
    "analysis-report": report_runs,
    "pilot-enroll": enroll_teacher,
    "timing-report": report_timing,
}


async def run(argv: list[str], settings: Settings) -> str:
    args = build_parser().parse_args(argv)
    engine = make_engine(settings.database_url)
    try:
        async with make_session_factory(engine)() as session:
            return await COMMANDS[args.command](session, args)
    finally:
        await engine.dispose()


def main() -> None:
    try:
        print(asyncio.run(run(sys.argv[1:], Settings())))
    except DomainError as error:
        print(f"error: {error.code}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
