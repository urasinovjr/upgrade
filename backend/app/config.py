from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    public_url: str = "http://localhost:5173"
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

    mail_from: str = "UpGrade <no-reply@upgrade.local>"
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_password: SecretStr = SecretStr("")
    smtp_tls: Literal["none", "starttls", "tls"] = "none"
    smtp_timeout: float = 10.0
    email_job_attempts: int = 5

    s3_endpoint_url: str = "http://localhost:9000"
    s3_region: str = "us-east-1"
    s3_access_key: str = "upgrade"
    s3_secret_key: SecretStr = SecretStr("upgrade-secret")
    s3_bucket: str = "upgrade-files"
    s3_create_bucket: bool = True
    cleanup_job_attempts: int = 10
