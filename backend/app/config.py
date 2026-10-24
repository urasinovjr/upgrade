from typing import Literal, Self

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

LOCAL_HOSTS = {"localhost", "127.0.0.1", "mailpit"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    public_url: str = "http://127.0.0.1:5173"
    database_url: str = "postgresql+asyncpg://upgrade:upgrade@localhost:5433/upgrade"
    db_pool_size: int = 20
    provider_url: str = "http://localhost:8011"
    provider_timeout: float = 6.0
    provider_concurrency: int = 0
    sync_claim_seconds: float = 3.0
    analysis_variant: str = "sim"
    analysis_api_key: SecretStr = SecretStr("")
    analysis_folder_id: str = ""
    analysis_timeout: float = 180.0
    analysis_max_bytes: int = 50 * 1024 * 1024
    redaction_dpi: int = 150
    redaction_max_side: int = 2000
    redaction_max_pixels: int = 40_000_000
    sync_attempts: int = 2
    job_attempts: int = 5
    retry_delay: float = 0.5
    lease_seconds: float = 5.0
    heartbeat_seconds: float = 1.5
    worker_concurrency: int = 16
    analysis_concurrency: int = 1
    rate_limit_delay: float = 5.0
    rate_limit_max_delay: float = 120.0
    rate_limit_deferrals: int = 20
    poll_seconds: float = 0.2
    heartbeat_file: str = "/tmp/upgrade-worker-heartbeat"
    heartbeat_seconds: float = 10.0
    stand_enabled: bool = True
    log_format: Literal["json", "text"] = "json"
    log_level: str = "info"
    app_commit: str = ""

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
    terms_url: str = "http://127.0.0.1:5173/legal/terms"
    terms_version: str = "2026-10-21"
    personal_data_url: str = "http://127.0.0.1:5173/legal/personal-data"
    personal_data_version: str = "2026-10-21"

    trial_days: int = 14
    billing_contact_url: str = "mailto:support@upgrade.local"

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
    s3_connect_timeout: float = 5.0
    s3_read_timeout: float = 30.0
    s3_attempts: int = 2
    cleanup_job_attempts: int = 10

    max_file_bytes: int = 20 * 1024 * 1024
    max_files_per_work: int = 20
    max_pages_per_work: int = 40
    max_draft_bytes: int = 512 * 1024

    def service_problems(self) -> list[str]:
        problems = []
        if self.smtp_host in LOCAL_HOSTS:
            problems.append("SMTP_HOST must name a real mail server")
        if self.smtp_tls == "none":
            problems.append("SMTP_TLS must be tls or starttls")
        if self.mail_from.rstrip(">").endswith(".local"):
            problems.append("MAIL_FROM must use a real domain")
        origin = "/".join(self.public_url.split("/")[:3])
        if origin not in self.allowed_origins:
            problems.append("ALLOWED_ORIGINS must contain the PUBLIC_URL origin")
        if any(not item.startswith("https://") for item in self.allowed_origins):
            problems.append("ALLOWED_ORIGINS must use https")
        documents = (self.terms_url, self.personal_data_url)
        if not all(url.startswith("https://") for url in documents):
            problems.append("TERMS_URL and PERSONAL_DATA_URL must use https")
        if self.yandex_client_id and not self.yandex_client_secret.get_secret_value():
            problems.append("YANDEX_CLIENT_SECRET must be set")
        if self.s3_access_key == "upgrade":
            problems.append("S3_ACCESS_KEY must be set")
        return problems

    @model_validator(mode="after")
    def check_production(self) -> Self:
        if self.app_env != "production":
            return self
        problems = []
        if not self.cookie_secure:
            problems.append("COOKIE_SECURE must be true")
        if self.stand_enabled:
            problems.append("STAND_ENABLED must be false")
        if not self.public_url.startswith("https://"):
            problems.append("PUBLIC_URL must use https")
        if self.s3_secret_key.get_secret_value() == "upgrade-secret":
            problems.append("S3_SECRET_KEY must be set")
        if "upgrade:upgrade@" in self.database_url:
            problems.append("DATABASE_URL must not use the development password")
        if self.analysis_variant == "sim":
            problems.append("ANALYSIS_VARIANT must name a real provider")
        if not self.analysis_api_key.get_secret_value():
            problems.append("ANALYSIS_API_KEY must be set")
        problems += self.service_problems()
        if problems:
            raise ValueError("; ".join(problems))
        return self
