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

    allowed_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    session_cookie_name: str = "upgrade_session"
    session_days: int = 30
    cookie_secure: bool = False
    login_lock_threshold: int = 5
    login_lock_max_minutes: int = 15
    auth_rate_per_minute: int = 20
    email_cooldown_seconds: int = 60
    confirm_token_hours: int = 24
    reset_token_minutes: int = 60
    terms_url: str = "http://localhost:5173/legal/terms"
    terms_version: str = "2026-10-21"
    personal_data_url: str = "http://localhost:5173/legal/personal-data"
    personal_data_version: str = "2026-10-21"

    oauth_cookie_name: str = "upgrade_oauth"
    oauth_state_minutes: int = 10
    oauth_timeout: float = 10.0
    yandex_client_id: str = ""
    yandex_client_secret: SecretStr = SecretStr("")
    yandex_authorize_url: str = "https://oauth.yandex.ru/authorize"
    yandex_token_url: str = "https://oauth.yandex.ru/token"
    yandex_info_url: str = "https://login.yandex.ru/info"
    vk_client_id: str = ""
    vk_authorize_url: str = "https://id.vk.ru/authorize"
    vk_token_url: str = "https://id.vk.ru/oauth2/auth"
    vk_info_url: str = "https://id.vk.ru/oauth2/user_info"

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
