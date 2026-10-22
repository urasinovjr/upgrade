FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:0.10.11 /uv /bin/uv

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

ARG APP_COMMIT=unknown
ENV PATH="/app/.venv/bin:$PATH" APP_COMMIT=$APP_COMMIT

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
