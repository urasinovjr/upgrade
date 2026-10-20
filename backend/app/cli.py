import argparse
import asyncio
import sys

from app.access.accounts import find_user_by_email
from app.billing import grant_subscription, upsert_plan
from app.config import Settings
from app.database import make_engine, make_session_factory
from app.errors import DomainError


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
    return parser


async def run(argv: list[str], settings: Settings) -> str:
    args = build_parser().parse_args(argv)
    engine = make_engine(settings.database_url)
    try:
        async with make_session_factory(engine)() as session:
            if args.command == "plan-upsert":
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
            user = await find_user_by_email(session, args.email)
            if user is None:
                raise DomainError("user_not_found")
            subscription = await grant_subscription(
                session, user.id, args.plan, args.days, args.note
            )
            await session.commit()
            return f"subscription for {user.email} ends {subscription.ends_at.isoformat()}"
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
