import { X } from "lucide-react";
import type { Work, WorkStatus } from "../../domain/models";
import { activity, plural, statusCounts, type ActivityFilter } from "../../domain/analytics";
import { statusMeta } from "../../shared/status";
import { dayLabel } from "../../shared/text";

const statuses: WorkStatus[] = [
  "failed",
  "needs_input",
  "ready",
  "preparation",
  "processing",
  "queued",
  "confirmed",
];
type ChartProps = {
  works: Work[];
  filter: ActivityFilter;
  onChange: (value: ActivityFilter) => void;
  titleId?: string;
};

export function Analytics(props: Omit<ChartProps, "titleId">) {
  return (
    <section className="dp-analytics" aria-label="Аналитика работ">
      <ActivityChart {...props} />
      <StatusChart {...props} />
    </section>
  );
}

export function ActivityChart({ works, filter, onChange, titleId }: ChartProps) {
  const days = activity(works);
  const maximum = Math.max(1, ...days.flatMap((day) => [day.created, day.confirmed]));
  const total = days.reduce((sum, day) => sum + day.created, 0);
  const confirmed = days.reduce((sum, day) => sum + day.confirmed, 0);
  return (
    <div className="dp-activity">
      <div className="dp-chart-heading">
        <div>
          <h2 id={titleId}>Ритм работы</h2>
          <p>Последние 14 дней</p>
        </div>
        <div className="dp-chart-totals">
          <span data-series="created">
            <strong>{total}</strong>
            добавлено
          </span>
          <span data-series="confirmed">
            <strong>{confirmed}</strong>
            опубликовано впервые
          </span>
        </div>
      </div>
      <div
        className="dp-bars"
        role="group"
        aria-label="Активность по дням. Выберите день, чтобы отфильтровать работы"
      >
        {days.map((day, index) => (
          <button
            key={day.day}
            aria-pressed={filter.day === day.day}
            title={`${dayLabel(day.day)} · добавлено ${day.created}, опубликовано впервые ${day.confirmed}`}
            aria-label={`${dayLabel(day.day)}: добавлено ${day.created}, опубликовано впервые ${day.confirmed}`}
            onClick={() =>
              onChange({ ...filter, day: filter.day === day.day ? undefined : day.day })
            }
          >
            <span className="dp-bar-pair" aria-hidden="true">
              {day.created > 0 && <i style={{ height: `${(day.created / maximum) * 100}%` }} />}
              {day.confirmed > 0 && (
                <i
                  data-series="confirmed"
                  style={{ height: `${(day.confirmed / maximum) * 100}%` }}
                />
              )}
            </span>
            <span
              aria-hidden="true"
              className={index % 3 === 0 || index === 13 ? "" : "dp-axis-hidden"}
            >
              {Number(day.day.slice(-2))}
            </span>
          </button>
        ))}
      </div>
      <div className="dp-chart-legend">
        <span>
          <i aria-hidden="true" />
          Добавлено
        </span>
        <span>
          <i aria-hidden="true" data-series="confirmed" />
          Опубликовано впервые
        </span>
        <span className="dp-chart-period">
          {dayLabel(days[0].day)} — {dayLabel(days[13].day)}
        </span>
      </div>
      {!total && !confirmed && (
        <p className="dp-chart-empty">За этот период новых работ и публикаций нет</p>
      )}
    </div>
  );
}

export function StatusChart({ works, filter, onChange, titleId }: ChartProps) {
  const counts = statusCounts(works);
  const present = statuses.filter((status) => counts.has(status));
  return (
    <div className="dp-status-chart">
      <div className="dp-chart-heading">
        <div>
          <h2 id={titleId}>Состояние работ</h2>
          <p>Весь кабинет · {plural(works.length, ["работа", "работы", "работ"])}</p>
        </div>
      </div>
      <div className="dp-status-track" aria-hidden="true">
        {present.map((status) => (
          <span
            key={status}
            className={"dp-tone-" + statusMeta[status].tone}
            style={{ flex: counts.get(status) }}
          />
        ))}
      </div>
      <div className="dp-status-legend" role="group" aria-label="Фильтр по состоянию">
        {present.map((status) => {
          const { label, tone, Icon } = statusMeta[status];
          return (
            <button
              key={status}
              className={"dp-tone-" + tone}
              aria-pressed={filter.status === status}
              onClick={() =>
                onChange({ ...filter, status: filter.status === status ? undefined : status })
              }
            >
              <Icon size={14} />
              <span>{label}</span>
              <strong>{counts.get(status)}</strong>
            </button>
          );
        })}
      </div>
      {!works.length && (
        <p className="dp-chart-empty">Добавьте первую работу, чтобы увидеть сводку</p>
      )}
    </div>
  );
}
export function ActiveFilter({ parts, onReset }: { parts: string[]; onReset: () => void }) {
  if (!parts.length) return null;
  return (
    <div className="dp-active-filter">
      <span role="status">{parts.join(" · ")}</span>
      <button onClick={onReset}>
        Сбросить фильтры <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
