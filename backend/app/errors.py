from fastapi import Request, status
from fastapi.responses import JSONResponse

REGISTRY: dict[str, int] = {
    "job_not_found": status.HTTP_404_NOT_FOUND,
    "provider_timeout": status.HTTP_504_GATEWAY_TIMEOUT,
    "provider_unavailable": status.HTTP_502_BAD_GATEWAY,
    "provider_rate_limited": status.HTTP_503_SERVICE_UNAVAILABLE,
}


class DomainError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code
        self.status_code = REGISTRY.get(code, status.HTTP_400_BAD_REQUEST)


async def domain_error_handler(request: Request, error: Exception) -> JSONResponse:
    assert isinstance(error, DomainError)
    return JSONResponse({"detail": error.code}, status_code=error.status_code)
