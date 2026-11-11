import { useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Plus } from "lucide-react";
import { useStore } from "../../shared/query";
import { PageBar, PageLoading, PageState } from "../../shared/ui";
import { WorkQueue } from "./WorkQueue";
import { Analytics } from "./WorkInsights";
import { chartFilterPatch, revealQueue, useQueueFilters } from "./useQueueFilters";
import { useWriteAccess } from "../../shared/session";

export default function Works() {
  const query = useStore();
  const { filters, update } = useQueueFilters();
  const access = useWriteAccess();
  const queueRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const focusSearch = (location.state as { focusSearch?: boolean } | null)?.focusSearch;
  const loaded = !!query.data;
  useEffect(() => {
    if (focusSearch && loaded)
      void navigate(location.pathname + location.search, {
        replace: true,
        state: null,
        preventScrollReset: true,
      });
  }, [focusSearch, loaded, navigate, location.pathname, location.search]);
  const bar = (
    <PageBar
      actions={
        access.allowed ? (
          <Link className="dp-primary dp-new-work" to="/homework">
            <Plus size={16} aria-hidden="true" />
            <span>Открыть ДЗ</span>
          </Link>
        ) : (
          <button className="dp-primary dp-new-work" disabled>
            <Plus size={16} aria-hidden="true" />
            <span>Открыть ДЗ</span>
          </button>
        )
      }
    />
  );
  if (query.isPending)
    return (
      <>
        {bar}
        <PageLoading />
      </>
    );
  if (!query.data)
    return (
      <PageState
        title="Проверка"
        errorTitle="Не удалось загрузить работы"
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  return (
    <>
      {bar}
      <div className="dp-page dp-works">
        <p className="dp-caption">
          Здесь проверяются сдачи учеников. Условия и загрузка решений доступны в назначенном ДЗ
        </p>
        <WorkQueue
          ref={queueRef}
          state={query.data}
          mode="full"
          filters={filters}
          update={update}
          autoFocusSearch={focusSearch}
        />
        {!!query.data.works.length && (
          <Analytics
            works={query.data.works}
            filter={{ day: filters.day, status: filters.status }}
            onChange={(value) => {
              update(chartFilterPatch(value));
              revealQueue(queueRef.current);
            }}
          />
        )}
      </div>
    </>
  );
}
