import { Link } from "react-router";
import { ArrowUpRight, Target } from "lucide-react";
import type { DashboardSummary } from "../../../domain/dashboard";
import { Avatar } from "../../../shared/ui";
import { topicMapLink } from "../../knowledge/links";

export function Focus({ summary }: { summary: DashboardSummary }) {
  return (
    <aside className="dp-recs" aria-labelledby="recs-title">
      <h2 id="recs-title">
        <Target size={14} aria-hidden="true" />
        Фокус на ученике
        {!!summary.openGaps && <span className="dp-count">{summary.openGaps}</span>}
      </h2>
      <p className="dp-recs-lead">Что повторить дальше</p>
      {summary.recommendations.length ? (
        <ul>
          {summary.recommendations.map(({ student, gap, topicName }) => (
            <li key={student.id + ":" + gap.topicId}>
              <Link
                className="dp-rec dashboard-recommendation"
                to={topicMapLink(student.id, gap.topicId)}
              >
                <Avatar student={student} size="sm" />
                <span>
                  <strong>{topicName}</strong>
                  <small title={gap.reason}>
                    {student.name} · {gap.reason}
                  </small>
                </span>
                <ArrowUpRight className="dp-rec-arrow" size={14} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dp-recs-empty">
          Открытых пробелов нет. Они появятся, когда вы подтвердите работы.
        </p>
      )}
    </aside>
  );
}
