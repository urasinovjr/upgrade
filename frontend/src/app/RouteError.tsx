import { useRouteError } from "react-router";
import { PageState } from "../shared/ui";
export function RouteError() {
  const error = useRouteError();
  return (
    <PageState
      title="Не удалось открыть экран"
      description="Обновите страницу или вернитесь к списку работ. Всё, что вы сохранили, на месте"
      error={error}
      to="/works"
      linkLabel="К работам"
    />
  );
}
export function ShellError() {
  return (
    <div className="dp-app">
      <main id="main-content" className="dp-main">
        <RouteError />
      </main>
    </div>
  );
}
