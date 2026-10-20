# UpGrade

Сервис для репетиторов: загрузка решений учеников, разбор по шагам, подтверждение преподавателем и отчёты.

## Запуск всего стека

Нужен Docker. Из корня репозитория:

```sh
docker compose up -d --build --wait
```

| Адрес | Что открыто |
| --- | --- |
| http://127.0.0.1:8080 | приложение (nginx со сборкой `build:server` и прокси `/api`) |
| http://127.0.0.1:8025 | Mailpit: письма с подтверждением и сбросом пароля |
| http://127.0.0.1:8010/docs | схема API |

Остановить: `docker compose down`. Данные PostgreSQL и файлов сохраняются в томах `db_data` и `s3_data`; `docker compose down -v` удаляет и их. После изменения кода пересобрать: `docker compose up -d --build --wait`.

## Frontend

React 19, TypeScript, Vite. Два режима одного приложения:

- демо (`npm run dev`, `npm run build:standalone`) хранит данные в IndexedDB браузера и не требует входа;
- серверный (`npm run dev:server`, `npm run build:server`) работает с API: регистрация, вход, подписка и данные на сервере. Режим включает переменная `VITE_API_URL` из `.env.server`.

```sh
cd frontend
npm install
npm run dev
```

Для разработки интерфейса с горячей перезагрузкой серверный режим можно запустить через Vite поверх стека из `docker compose`. Vite проксирует `/api` на `http://127.0.0.1:8010` (адрес меняет `API_PROXY_TARGET`):

```sh
npm run dev:server
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
npm run e2e:server
npm run e2e:docker
```

`npm run e2e:server` и `npm run e2e:docker` проходят регистрацию, письмо в Mailpit, загрузку, разбор, подтверждение, режим только чтения и удаление на поднятом стеке. Первый сам запускает `dev:server` (порт 5173 должен быть свободен), второй проверяет контейнер `frontend` на порту 8080.

Переносимая сборка в один HTML-файл: `npm run build:standalone`.

## Backend

FastAPI, SQLAlchemy 2 (asyncpg), PostgreSQL, Alembic. Модульный монолит: пакеты `access`, `billing`, `students`, `knowledge`, `works`, `analysis`, `files`, `mail`, общая очередь `queue` и стенд `stand`.

Сервисы `compose.yaml` в корне репозитория:

| Сервис | Назначение |
| --- | --- |
| `frontend` | nginx со сборкой интерфейса, порт 8080 |
| `db` | PostgreSQL, порт 5433 |
| `api` | API на порту 8010, при старте применяет миграции |
| `worker` | тот же образ: обработка работ, письма, очистка файлов, задачи стенда |
| `s3` | SeaweedFS с S3 API на порту 9000 для файлов работ |
| `mailpit` | SMTP на порту 1025 и просмотр писем на http://127.0.0.1:8025 |
| `provider-sim` | имитатор OCR и LLM |

```sh
docker compose up -d --build --wait
cd backend
uv sync
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

Тесты используют PostgreSQL из `docker compose` и отдельную базу `upgrade_test`. Проверки настоящего S3 и SMTP пропускаются, если сервисы не запущены.

### API

Маршруты продукта находятся под `/api`, схема — на `/docs`. Изменяющие запросы с сессией передают заголовок `X-CSRF-Token` из ответа входа. Без активной подписки изменения отклоняются с кодом 402; просмотр, экспорт и удаление остаются доступны. Ошибки возвращаются как `{"detail": "<код>"}`.

### Настройки

Все параметры читаются из окружения (`app/config.py`). Для production обязательны:

| Переменная | Значение |
| --- | --- |
| `APP_ENV` | `production` |
| `PUBLIC_URL` | адрес frontend, из него строятся ссылки в письмах |
| `ALLOWED_ORIGINS` | JSON-список адресов frontend |
| `COOKIE_SECURE` | `true` |
| `STAND_ENABLED` | `false`, иначе открыты маршруты стенда без входа |
| `DATABASE_URL` | строка подключения PostgreSQL |
| `S3_ENDPOINT_URL`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_CREATE_BUCKET=false` | объектное хранилище |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_TLS`, `MAIL_FROM` | отправка писем |
| `TERMS_URL`, `TERMS_VERSION`, `PERSONAL_DATA_URL`, `PERSONAL_DATA_VERSION` | документы, на которые даётся согласие |
| `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET`, `VK_CLIENT_ID` | вход через Яндекс ID и VK ID; без них кнопки не показываются |
| `BILLING_CONTACT_URL` | куда ведёт кнопка «Оформить подписку» |

Redirect URI у провайдеров входа: `<PUBLIC_URL>/auth/callback/yandex` и `<PUBLIC_URL>/auth/callback/vk`.

### Подписки

Пробный период на 14 дней начинается после подтверждения почты или входа через провайдера. До подключения оплаты тарифы и подписки ведёт администратор:

```sh
uv run python -m app.cli plan-upsert --code teacher --title "Репетитор" --price-minor 99000 --days 30
uv run python -m app.cli grant-subscription --email teacher@example.com --plan teacher --note "пилот"
```

Подписка, выданная во время действующего периода, начинается после его окончания.

### Стенд асинхронной обработки

- `POST /works` с заголовком `Idempotency-Key` сохраняет работу и задачу и сразу отвечает 202. `POST /sync/works` вызывает распознавание и разбор прямо в запросе.
- `worker` забирает задачи через `SELECT … FOR UPDATE SKIP LOCKED`, продлевает аренду и повторяет неудачные попытки с паузой. Продуктовые задачи используют ту же очередь.
- `provider-sim` имитирует OCR и LLM с задержками и сбоями по профилю `normal` или `degraded`.

Нагрузочный прогон и сводка:

```sh
uv run python -m loadgen.run --mode async --level 1 --seed 1
uv run python -m loadgen.matrix --skip-done
uv run python -m loadgen.matrix --scaling --skip-done
uv run python -m loadgen.analyze
```

Время на стенде сжато в 10 раз (`TIME_SCALE = 0.1`): одна секунда стенда соответствует десяти секундам реальной работы провайдера. Флаг `--scaling` повторяет асинхронные прогоны на нагрузке ×5 и ×10 с четырьмя экземплярами worker'а. Сырые данные прогонов лежат в `backend/loadgen/results/runs`, сводка — в `backend/loadgen/results/summary.csv`.
