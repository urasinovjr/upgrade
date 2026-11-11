import { useId } from "react";
import type { ActivityFilter } from "../../../domain/analytics";
import { plural } from "../../../domain/analytics";
import {
  closuresByWeek,
  errorsByTopic,
  reviewSpeed,
  type SpeedBucket,
} from "../../../domain/insights";
import type { Closure, Topic, Work } from "../../../domain/models";
import { dayLabel, duration } from "../../../shared/text";
import { ActivityChart, StatusChart } from "../../works/WorkInsights";
import { WidgetEmpty, WidgetSection } from "./WidgetSection";

type ChartWidgetProps = {
  works: Work[];
  filter: ActivityFilter;
  onChange: (value: ActivityFilter) => void;
};

export function ActivityWidget(props: ChartWidgetProps) {
  const id = useId();
  return (
    <section className="dp-chart-widget" aria-labelledby={id}>
      <ActivityChart {...props} titleId={id} />
    </section>
  );
}
export function StatusWidget(props: ChartWidgetProps) {
  const id = useId();
  return (
    <section className="dp-chart-widget" aria-labelledby={id}>
      <StatusChart {...props} titleId={id} />
    </section>
  );
}

function Meter({
  label,
  value,
  share,
  tone,
}: {
  label: string;
  value: string;
  share: number;
  tone: string;
}) {
  return (
    <li className="dp-meter-row">
      <span className="dp-meter-label">{label}</span>
      <span className="dp-meter" aria-hidden="true">
        {share > 0 && <i className={"dp-tone-" + tone} style={{ width: `${share * 100}%` }} />}
      </span>
      <span className="dp-meter-value">{value}</span>
    </li>
  );
}

export function TopicErrors({ works, topics }: { works: Work[]; topics: Topic[] }) {
  const rows = errorsByTopic(works, topics);
  return (
    <WidgetSection
      title="Ошибки по темам"
      caption="Доля шагов с ошибкой в опубликованных результатах"
    >
      {rows.length ? (
        <ul className="dp-meter-list">
          {rows.map((row) => (
            <Meter
              key={row.topicId}
              label={row.name}
              share={row.share}
              tone="danger"
              value={`${Math.round(row.share * 100)}% · ${row.errors} из ${plural(row.steps, ["шага", "шагов", "шагов"])}`}
            />
          ))}
        </ul>
      ) : (
        <WidgetEmpty>Появится после первой публикации результата</WidgetEmpty>
      )}
    </WidgetSection>
  );
}

const bucketLabels: Record<SpeedBucket, string> = {
  hour: "До часа",
  day: "До суток",
  threeDays: "До 3 дней",
  week: "До недели",
  more: "Дольше недели",
};
export function ReviewSpeed({ works }: { works: Work[] }) {
  const speed = reviewSpeed(works);
  const maximum = Math.max(1, ...speed.buckets.map((bucket) => bucket.count));
  return (
    <WidgetSection title="Скорость проверки" caption="От загрузки до первой публикации результата">
      {speed.median !== undefined ? (
        <>
          <p className="dp-insight-figure">
            <strong>{duration(speed.median)}</strong>
            <span>медиана по {plural(speed.count, ["работе", "работам", "работам"])}</span>
          </p>
          <ul className="dp-meter-list">
            {speed.buckets.map((bucket) => (
              <Meter
                key={bucket.key}
                label={bucketLabels[bucket.key]}
                share={bucket.count / maximum}
                tone="action"
                value={String(bucket.count)}
              />
            ))}
          </ul>
        </>
      ) : (
        <WidgetEmpty>Появится после первой публикации результата</WidgetEmpty>
      )}
    </WidgetSection>
  );
}

export function Closures({ closures }: { closures: Closure[] }) {
  const weeks = closuresByWeek(closures);
  const closed = weeks.reduce((sum, week) => sum + week.closed, 0);
  const reopened = weeks.reduce((sum, week) => sum + week.reopened, 0);
  const maximum = Math.max(1, ...weeks.flatMap((week) => [week.closed, week.reopened]));
  return (
    <WidgetSection title="Закрытые пробелы" caption="Последние 8 недель">
      <div className="dp-insight-totals">
        <span className="dp-tone-success">
          <strong>{closed}</strong>
          закрыто
        </span>
        <span className="dp-tone-warning">
          <strong>{reopened}</strong>
          открыто снова
        </span>
      </div>
      {closed || reopened ? (
        <ol className="dp-week-bars">
          {weeks.map((week, index) => (
            <li
              key={week.week}
              aria-label={`Неделя с ${dayLabel(week.week)}: закрыто ${week.closed}, открыто снова ${week.reopened}`}
            >
              <span className="dp-bar-pair" aria-hidden="true">
                {week.closed > 0 && (
                  <i
                    className="dp-tone-success"
                    style={{ height: `${(week.closed / maximum) * 100}%` }}
                  />
                )}
                {week.reopened > 0 && (
                  <i
                    className="dp-tone-warning"
                    style={{ height: `${(week.reopened / maximum) * 100}%` }}
                  />
                )}
              </span>
              <span aria-hidden="true" className={index % 2 ? "dp-axis-hidden" : ""}>
                {dayLabel(week.week)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <WidgetEmpty>За эти недели пробелы не закрывались</WidgetEmpty>
      )}
    </WidgetSection>
  );
}
