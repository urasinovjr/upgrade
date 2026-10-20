from fastapi import Request, status
from fastapi.responses import JSONResponse

REGISTRY: dict[str, int] = {
    "job_not_found": status.HTTP_404_NOT_FOUND,
    "provider_timeout": status.HTTP_504_GATEWAY_TIMEOUT,
    "provider_unavailable": status.HTTP_502_BAD_GATEWAY,
    "provider_rate_limited": status.HTTP_503_SERVICE_UNAVAILABLE,
    "not_authenticated": status.HTTP_401_UNAUTHORIZED,
    "invalid_credentials": status.HTTP_401_UNAUTHORIZED,
    "csrf_failed": status.HTTP_403_FORBIDDEN,
    "origin_forbidden": status.HTTP_403_FORBIDDEN,
    "email_not_confirmed": status.HTTP_403_FORBIDDEN,
    "account_locked": status.HTTP_423_LOCKED,
    "rate_limited": status.HTTP_429_TOO_MANY_REQUESTS,
    "token_invalid": status.HTTP_400_BAD_REQUEST,
    "consent_required": status.HTTP_400_BAD_REQUEST,
    "password_too_weak": status.HTTP_422_UNPROCESSABLE_CONTENT,
    "oauth_provider_unknown": status.HTTP_404_NOT_FOUND,
    "oauth_identity_not_found": status.HTTP_404_NOT_FOUND,
    "oauth_state_invalid": status.HTTP_400_BAD_REQUEST,
    "oauth_signup_requires_consent": status.HTTP_400_BAD_REQUEST,
    "oauth_email_taken": status.HTTP_409_CONFLICT,
    "oauth_identity_taken": status.HTTP_409_CONFLICT,
    "last_login_method": status.HTTP_409_CONFLICT,
    "oauth_failed": status.HTTP_502_BAD_GATEWAY,
    "subscription_inactive": status.HTTP_402_PAYMENT_REQUIRED,
    "plan_not_found": status.HTTP_404_NOT_FOUND,
    "student_not_found": status.HTTP_404_NOT_FOUND,
    "closure_note_required": status.HTTP_422_UNPROCESSABLE_CONTENT,
    "preference_too_large": status.HTTP_413_CONTENT_TOO_LARGE,
    "work_not_found": status.HTTP_404_NOT_FOUND,
    "file_not_found": status.HTTP_404_NOT_FOUND,
    "revision_not_found": status.HTTP_404_NOT_FOUND,
    "work_exists": status.HTTP_409_CONFLICT,
    "draft_conflict": status.HTTP_409_CONFLICT,
    "analysis_in_progress": status.HTTP_409_CONFLICT,
    "editing_closed": status.HTTP_409_CONFLICT,
    "review_blocked": status.HTTP_409_CONFLICT,
    "file_too_large": status.HTTP_413_CONTENT_TOO_LARGE,
    "request_too_large": status.HTTP_413_CONTENT_TOO_LARGE,
    "draft_too_large": status.HTTP_413_CONTENT_TOO_LARGE,
    "file_type_unsupported": status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
    "too_many_files": status.HTTP_422_UNPROCESSABLE_CONTENT,
    "too_many_pages": status.HTTP_422_UNPROCESSABLE_CONTENT,
    "file_unreadable": status.HTTP_422_UNPROCESSABLE_CONTENT,
    "attachments_mismatch": status.HTTP_422_UNPROCESSABLE_CONTENT,
    "work_meta_invalid": status.HTTP_422_UNPROCESSABLE_CONTENT,
    "storage_unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
}


class DomainError(Exception):
    def __init__(self, code: str, extra: dict | None = None):
        super().__init__(code)
        self.code = code
        self.extra = extra or {}
        self.status_code = REGISTRY.get(code, status.HTTP_400_BAD_REQUEST)


async def domain_error_handler(request: Request, error: Exception) -> JSONResponse:
    assert isinstance(error, DomainError)
    return JSONResponse({"detail": error.code, **error.extra}, status_code=error.status_code)
