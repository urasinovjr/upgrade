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
