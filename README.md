# UpGrade

Сервис для репетиторов: загрузка решений учеников, разбор по шагам, подтверждение преподавателем и отчёты.

## Frontend

React 19, TypeScript, Vite. Данные хранятся в IndexedDB браузера.

```sh
cd frontend
npm install
npm run dev
```

Проверки:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium webkit
npm run e2e
```

Переносимая сборка в один HTML-файл: `npm run build:standalone`.

## Backend

FastAPI, SQLAlchemy 2 (asyncpg), PostgreSQL, Alembic. Стенд асинхронной обработки:

- `api` принимает работы. `POST /works` с заголовком `Idempotency-Key` сохраняет работу и задачу и сразу отвечает 202. `POST /sync/works` вызывает распознавание и разбор прямо в запросе.
- `worker` из того же образа забирает задачи через `SELECT … FOR UPDATE SKIP LOCKED`, продлевает аренду и повторяет неудачные попытки с паузой.
- `provider-sim` имитирует OCR и LLM с задержками и сбоями по профилю `normal` или `degraded`.

```sh
cd backend
uv sync
docker compose up -d --build --wait
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

Нагрузочный прогон и сводка:

```sh
uv run python -m loadgen.run --mode async --level 1 --seed 1
uv run python -m loadgen.matrix --skip-done
uv run python -m loadgen.analyze
```

Время на стенде сжато в 10 раз (`TIME_SCALE = 0.1`): одна секунда стенда соответствует десяти секундам реальной работы провайдера. Сырые данные прогонов лежат в `backend/loadgen/results/runs`, сводка — в `backend/loadgen/results/summary.csv`.
