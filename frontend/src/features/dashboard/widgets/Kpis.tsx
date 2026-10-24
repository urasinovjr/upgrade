import { Link } from "react-router";
import { ArrowUpRight, Target, Users } from "lucide-react";
import type { DashboardSummary } from "../../../domain/dashboard";
import { statusMeta, type Tone } from "../../../shared/status";
import { topicMapLink } from "../../knowledge/links";

export function Kpis({ summary }: { summary: DashboardSummary }) {
  const firstGap = summary.recommendations[0];
  const metrics: Array<{
    label: string;
    value: number;
    Icon: typeof Users;
    tone: Tone;
    to: string;
  }> = [
    {
      label: statusMeta.ready.label,
      value: summary.awaiting,
      Icon: statusMeta.ready.Icon,
      tone: statusMeta.ready.tone,
      to: "/works?view=all&status=ready",
    },
    {
      label: statusMeta.needs_input.label,
      value: summary.needsInput,
      Icon: statusMeta.needs_input.Icon,
      tone: statusMeta.needs_input.tone,
      to: "/works?view=all&status=needs_input",
    },
    {
      label: "Подтверждены",
      value: summary.confirmed,
      Icon: statusMeta.confirmed.Icon,
      tone: statusMeta.confirmed.tone,
      to: "/works?view=confirmed",
    },
    {
      label: "Ученики",
      value: summary.studentCount,
      Icon: Users,
      tone: "pencil",
      to: "/students",
    },
    {
      label: "Открытые пробелы",
      value: summary.openGaps,
      Icon: Target,
      tone: summary.openGaps ? "danger" : "neutral",
      to: firstGap ? topicMapLink(firstGap.student.id, firstGap.gap.topicId) : "/students",
    },
  ];
  return (
    <section className="dp-kpis" aria-label="Сводка">
      {metrics.map(({ label, value, Icon, tone, to }) => (
        <Link key={label} className="dp-kpi" to={to} aria-label={label + ": " + value}>
          <span className="dp-kpi-head">
            <span className={"dp-kpi-icon dp-tone-" + tone}>
              <Icon size={16} aria-hidden="true" />
            </span>
            <span className="dp-kpi-label">{label}</span>
          </span>
          <strong>{value}</strong>
          <ArrowUpRight className="dp-kpi-arrow" size={14} aria-hidden="true" />
        </Link>
      ))}
    </section>
  );
}
