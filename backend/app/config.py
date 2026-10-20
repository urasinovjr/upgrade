from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://upgrade:upgrade@localhost:5433/upgrade"
    db_pool_size: int = 20
    provider_url: str = "http://localhost:8011"
    provider_timeout: float = 6.0
    sync_attempts: int = 2
    job_attempts: int = 5
    retry_delay: float = 0.5
    lease_seconds: float = 5.0
    heartbeat_seconds: float = 1.5
    worker_concurrency: int = 16
    poll_seconds: float = 0.2
    stand_enabled: bool = True
