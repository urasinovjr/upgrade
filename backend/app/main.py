from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import Settings
from app.database import make_engine, make_session_factory
from app.errors import DomainError, domain_error_handler
from app.files import S3Storage, Storage
from app.mail import Mailer, SmtpMailer
from app.provider import Provider
from app.stand.router import router as stand_router


def create_app(
    settings: Settings | None = None,
    provider: Provider | None = None,
    storage: Storage | None = None,
    mailer: Mailer | None = None,
) -> FastAPI:
    app_settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = make_engine(app_settings.database_url, app_settings.db_pool_size)
        app.state.settings = app_settings
        app.state.sessions = make_session_factory(engine)
        app.state.provider = provider or Provider(
            app_settings.provider_url, app_settings.provider_timeout
        )
        app.state.storage = storage or await S3Storage.connect(app_settings)
        app.state.mailer = mailer or SmtpMailer(app_settings)
        yield
        await app.state.storage.close()
        await app.state.provider.close()
        await engine.dispose()

    app = FastAPI(title="UpGrade", lifespan=lifespan)
    app.add_exception_handler(DomainError, domain_error_handler)
    if app_settings.stand_enabled:
        app.include_router(stand_router)

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
