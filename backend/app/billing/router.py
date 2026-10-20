from fastapi import APIRouter

from app.billing.schemas import PlanOut, SubscriptionOut
from app.billing.service import active_plans, describe_subscription
from app.dependencies import CurrentAccountDep, SessionDep, SettingsDep

router = APIRouter(tags=["billing"])


@router.get("/subscription")
async def read_subscription(
    current: CurrentAccountDep, session: SessionDep, settings: SettingsDep
) -> SubscriptionOut:
    return await describe_subscription(session, settings, current.user.id)


@router.get("/plans")
async def list_plans(current: CurrentAccountDep, session: SessionDep) -> list[PlanOut]:
    return [PlanOut.model_validate(plan) for plan in await active_plans(session)]
