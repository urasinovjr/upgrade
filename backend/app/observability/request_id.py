import logging
import re
import time
from contextvars import ContextVar
from uuid import uuid4

from starlette.types import ASGIApp, Message, Receive, Scope, Send

REQUEST_ID_HEADER = b"x-request-id"
VALID_REQUEST_ID = re.compile(r"[A-Za-z0-9-]{8,64}")
QUIET_PATHS = {"/health"}

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
logger = logging.getLogger("api")


def current_request_id() -> str | None:
    return request_id_var.get()


def read_request_id(value: str | None) -> str:
    if value and VALID_REQUEST_ID.fullmatch(value):
        return value
    return str(uuid4())


def header_value(scope: Scope, name: bytes) -> str | None:
    for key, value in scope["headers"]:
        if key == name:
            return value.decode("latin-1")
    return None


def route_of(scope: Scope) -> str:
    route = scope.get("route")
    template = getattr(route, "path_format", None)
    if template is None:
        return "unmatched"
    try:
        rendered = template.format(**scope.get("path_params", {}))
    except (KeyError, IndexError, ValueError):
        return template
    return scope["path"].removesuffix(rendered) + template


def log_request(scope: Scope, status: int, started: float) -> None:
    logger.info(
        "request",
        extra={
            "method": scope["method"],
            "route": route_of(scope),
            "status": status,
            "duration_ms": round((time.monotonic() - started) * 1000),
        },
    )


class RequestIdMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id = read_request_id(header_value(scope, REQUEST_ID_HEADER))
        token = request_id_var.set(request_id)
        started = time.monotonic()
        status = 500

        async def send_with_id(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                headers = [*message.get("headers", []), (REQUEST_ID_HEADER, request_id.encode())]
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            if scope["path"] not in QUIET_PATHS:
                log_request(scope, status, started)
            request_id_var.reset(token)
