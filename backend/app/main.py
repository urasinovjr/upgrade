from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI
from fastapi.responses import JSONResponse

from app.access.account_router import router as account_router
from app.access.oauth_client import HttpOAuthClient, OAuthClient
from app.access.router import router as auth_router
from app.billing.router import router as billing_router
from app.config import Settings
from app.database import make_engine, make_session_factory
from app.dependencies import verify_origin
from app.errors import DomainError, domain_error_handler, storage_error_handler
from app.events import APP_VERSION
from app.events import router as events_router
from app.files import S3Storage, Storage, StorageError
from app.health import unavailable_parts
from app.homework.router import router as homework_router
from app.homework.student_router import router as student_router
from app.knowledge.router import router as knowledge_router
from app.mail import Mailer, make_mailer
from app.models import configure_models
from app.observability import RequestIdMiddleware, configure_logging
from app.provider import Provider
from app.snapshot import router as snapshot_router
from app.stand.router import router as stand_router
from app.students.router import router as students_router
from app.timing import router as timing_router
from app.works.router import router as works_router


def create_app(
    settings: Settings | None = None,
    provider: Provider | None = None,
    storage: Storage | None = None,
    mailer: Mailer | None = None,
    oauth: OAuthClient | None = None,
) -> FastAPI:
    app_settings = settings or Settings()
    configure_models()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = make_engine(app_settings.database_url, app_settings.db_pool_size)
        app.state.settings = app_settings
        app.state.sessions = make_session_factory(engine)
        app.state.provider = provider or Provider(
            app_settings.provider_url,
            app_settings.provider_timeout,
            app_settings.provider_concurrency,
        )
        app.state.storage = storage or await S3Storage.connect(app_settings)
        app.state.mailer = mailer or make_mailer(app_settings)
        app.state.oauth = oauth or HttpOAuthClient(app_settings)
        yield
        await app.state.storage.close()
        await app.state.provider.close()
        await engine.dispose()

    app = FastAPI(title="UpGrade", version=APP_VERSION, lifespan=lifespan)
    app.add_middleware(RequestIdMiddleware)
    app.add_exception_handler(DomainError, domain_error_handler)
    app.add_exception_handler(StorageError, storage_error_handler)
    api = APIRouter(prefix="/api", dependencies=[Depends(verify_origin)])
    api.include_router(auth_router)
    api.include_router(account_router)
    api.include_router(billing_router)
    api.include_router(snapshot_router)
    api.include_router(students_router)
    api.include_router(knowledge_router)
    api.include_router(works_router)
    api.include_router(events_router)
    if app_settings.app_env != "production" or app_settings.homework_internal_test:
        api.include_router(homework_router)
        api.include_router(student_router)
    api.include_router(timing_router)
    app.include_router(api)
    if app_settings.stand_enabled:
        app.include_router(stand_router)

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok"}

    @app.get("/health/ready")
    async def ready() -> JSONResponse:
        failed = await unavailable_parts(app.state.sessions, app.state.storage)
        if failed:
            return JSONResponse({"status": "unavailable", "failed": failed}, status_code=503)
        return JSONResponse({"status": "ok"})

    return app


main_settings = Settings()
configure_logging(main_settings.log_format, main_settings.log_level)
app = create_app(main_settings)
