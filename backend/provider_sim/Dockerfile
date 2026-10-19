FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:0.10.11 /uv /bin/uv

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY sim.py ./

ENV PATH="/app/.venv/bin:$PATH"

CMD ["uvicorn", "sim:app", "--host", "0.0.0.0", "--port", "8001"]
