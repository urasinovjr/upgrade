import { Circle, CircleCheck, Target, type LucideIcon } from "lucide-react";
import type { Closure, StudentGap, Topic } from "../../domain/models";
import { topicStatusLabel } from "../../domain/analytics";
import { gradeTitle } from "../../domain/knowledgeFragment";
import { layoutKnowledgeMap } from "../../domain/knowledgeLayout";
import { topicLabel } from "../../data/catalog";
import type { Tone } from "../../shared/status";

export type TopicState = "open" | "closed" | "none";
export const topicStatus: Record<
  TopicState,
  { key: TopicState; label: string; tone: Tone; Icon: LucideIcon }
> = {
  open: { key: "open", label: topicStatusLabel.gap, tone: "danger", Icon: Target },
  closed: { key: "closed", label: topicStatusLabel.closed, tone: "success", Icon: CircleCheck },
  none: { key: "none", label: topicStatusLabel.none, tone: "neutral", Icon: Circle },
};
export function statusOf(gap?: StudentGap) {
  if (!gap) return topicStatus.none;
  return gap.closed ? topicStatus.closed : topicStatus.open;
}
export const topicName = topicLabel;

export type KnowledgeMapModel = ReturnType<typeof buildMap>;

export function buildMap(list: Topic[]) {
  const graph = layoutKnowledgeMap(list);
  const order = [...list].sort(
    (a, b) =>
      graph.nodes[a.id].y - graph.nodes[b.id].y || graph.nodes[a.id].x - graph.nodes[b.id].x,
  );
  const rows = [...new Set(order.map((topic) => graph.nodes[topic.id].y))];
  const levels: { key: string; title: string; topics: Topic[] }[] = [];
  rows.forEach((y, index) => {
    const row = order.filter((topic) => graph.nodes[topic.id].y === y);
    const title = gradeTitle(row.map((topic) => topic.grade ?? 0));
    const last = levels.at(-1);
    if (last?.title === title) last.topics.push(...row);
    else levels.push({ key: title + index, title, topics: row });
  });
  return { graph, order, levels };
}
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const dateTime = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
export const closureTitle = (closure: Closure) =>
  closure.action === "close" ? "Пробел закрыт" : "Пробел открыт снова";
