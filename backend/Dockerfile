FROM python:3.13-slim@sha256:e48f59cdba69a3cbd9ed2cf0f348d90d45a8d350d98134cf1070bc106ee9ed90 AS build

COPY --from=ghcr.io/astral-sh/uv:0.10.11@sha256:3472e43b4e738cf911c99d41bb34331280efad54c73b1def654a6227bb59b2b4 /uv /bin/uv

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,id=upgrade-uv,target=/root/.cache/uv \
    UV_LINK_MODE=copy UV_CONCURRENT_DOWNLOADS=2 UV_HTTP_TIMEOUT=120 \
    uv sync --frozen --no-dev --no-install-project

FROM python:3.13-slim@sha256:e48f59cdba69a3cbd9ed2cf0f348d90d45a8d350d98134cf1070bc106ee9ed90

RUN apt-get update \
    && apt-get install --yes --no-install-recommends zlib1g=1:1.3.dfsg+really1.3.1-1+deb13u1 \
    && rm -rf /var/lib/apt/lists/* \
    && python -m pip uninstall --yes pip

WORKDIR /app

COPY --from=build /app/.venv /app/.venv
COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

RUN useradd --system --uid 10001 --no-create-home upgrade

ARG APP_COMMIT=unknown
ENV PATH="/app/.venv/bin:$PATH" APP_COMMIT=$APP_COMMIT

USER 10001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
