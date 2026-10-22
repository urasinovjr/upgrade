import json
import logging
from datetime import UTC, datetime
from typing import Literal

from app.observability.request_id import current_request_id

LogFormat = Literal["json", "text"]

RECORD_FIELDS = set(vars(logging.makeLogRecord({}))) | {
    "message",
    "asctime",
    "taskName",
    "color_message",
}
UVICORN_LOGGERS = ("uvicorn", "uvicorn.error")
QUIET_LOGGERS = ("httpx", "httpcore", "aiobotocore", "botocore")


def extra_fields(record: logging.LogRecord) -> dict:
    return {key: value for key, value in vars(record).items() if key not in RECORD_FIELDS}


def log_entry(record: logging.LogRecord) -> dict:
    entry = {
        "ts": datetime.fromtimestamp(record.created, UTC).isoformat(),
        "level": record.levelname.lower(),
        "logger": record.name,
        "event": record.getMessage(),
    }
    request_id = current_request_id()
    if request_id is not None:
        entry["request_id"] = request_id
    entry.update(extra_fields(record))
    return entry


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = log_entry(record)
        if record.exc_info:
            entry["error"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False, default=str)


class TextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = log_entry(record)
        head = [entry.pop(key) for key in ("ts", "level", "logger", "event")]
        fields = [f"{key}={value}" for key, value in entry.items()]
        line = " ".join([*head, *fields])
        if record.exc_info:
            line += "\n" + self.formatException(record.exc_info)
        return line


def configure_logging(log_format: LogFormat, level: str) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter() if log_format == "json" else TextFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
    for name in UVICORN_LOGGERS:
        logging.getLogger(name).handlers = []
        logging.getLogger(name).propagate = True
    access = logging.getLogger("uvicorn.access")
    access.handlers = []
    access.propagate = False
    for name in QUIET_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)
