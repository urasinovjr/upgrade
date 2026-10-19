import { Circle, CircleCheck, Target, type LucideIcon } from "lucide-react";
import type { Closure, StudentGap } from "../../domain/models";
import { topicStatusLabel } from "../../domain/analytics";
import { layoutKnowledgeMap } from "../../domain/knowledgeLayout";
import { topics } from "../../data/fixtures";
import type { Tone } from "../../shared/status";

export type TopicState = "open" | "closed" | "none";
export const topicStatus: Record<
  TopicState,
  { key: TopicState; label: string; tone: Tone; Icon: LucideIcon }
> = {
  open: { key: "open", label: topicStatusLabel.gap, tone: "warning", Icon: Target },
  closed: { key: "closed", label: topicStatusLabel.closed, tone: "success", Icon: CircleCheck },
  none: { key: "none", label: topicStatusLabel.none, tone: "neutral", Icon: Circle },
};
export function statusOf(gap?: StudentGap) {
  if (!gap) return topicStatus.none;
  return gap.closed ? topicStatus.closed : topicStatus.open;
}
export const topicName = (id: string) => topics.find((topic) => topic.id === id)?.name ?? id;

export const graph = layoutKnowledgeMap(topics);
export const topicOrder = [...topics].sort(
  (a, b) => graph.nodes[a.id].y - graph.nodes[b.id].y || graph.nodes[a.id].x - graph.nodes[b.id].x,
);
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const dateTime = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
export const closureTitle = (closure: Closure) =>
  closure.action === "close" ? "Пробел закрыт" : "Пробел открыт снова";
