FROM python:3.13-slim@sha256:e48f59cdba69a3cbd9ed2cf0f348d90d45a8d350d98134cf1070bc106ee9ed90

COPY --from=ghcr.io/astral-sh/uv:0.10.11@sha256:3472e43b4e738cf911c99d41bb34331280efad54c73b1def654a6227bb59b2b4 /uv /bin/uv

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,id=upgrade-sim-uv,target=/root/.cache/uv \
    UV_LINK_MODE=copy UV_CONCURRENT_DOWNLOADS=2 UV_HTTP_TIMEOUT=120 \
    uv sync --frozen --no-dev --no-install-project

COPY sim.py ./

ENV PATH="/app/.venv/bin:$PATH"

CMD ["uvicorn", "sim:app", "--host", "0.0.0.0", "--port", "8001"]
