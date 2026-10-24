import { currentRevision, deriveGaps } from "./review";
import type { StoreState, Topic, Work, WorkStatus } from "./models";

export type ActivityFilter = { day?: string; status?: WorkStatus };
export const dayKey = (value: Date | string) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
export const isDayKey = (value: string | null | undefined): value is string =>
  !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && dayKey(value + "T12:00:00") === value;
export function firstConfirmation(work: Work) {
  return work.published.reduce<string | undefined>(
    (first, revision) => (!first || revision.confirmedAt < first ? revision.confirmedAt : first),
    undefined,
  );
}
export function activity(works: Work[], now = new Date()) {
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13 + index);
    return { day: dayKey(date), created: 0, confirmed: 0 };
  });
  const lookup = new Map(days.map((day) => [day.day, day]));
  works.forEach((work) => {
    const created = lookup.get(dayKey(work.createdAt));
    if (created) created.created++;
    const first = firstConfirmation(work);
    const confirmed = first && lookup.get(dayKey(first));
    if (confirmed) confirmed.confirmed++;
  });
  return days;
}
export function matchesActivity(work: Work, filter: ActivityFilter) {
  const first = firstConfirmation(work);
  const statusMatches = !filter.status || work.status === filter.status;
  const dayMatches =
    !filter.day ||
    dayKey(work.createdAt) === filter.day ||
    (!!first && dayKey(first) === filter.day);
  return statusMatches && dayMatches;
}
export function statusCounts(works: Work[]) {
  const counts = new Map<WorkStatus, number>();
  works.forEach((work) => counts.set(work.status, (counts.get(work.status) ?? 0) + 1));
  return counts;
}

export const attentionStatuses: WorkStatus[] = ["failed", "needs_input", "ready", "preparation"];
const urgency: WorkStatus[] = [...attentionStatuses, "processing", "queued", "confirmed"];
export const needsAttention = (work: Work) => attentionStatuses.includes(work.status);
export type QueueView = "attention" | "all" | "confirmed";
export function inQueueView(work: Work, view: QueueView) {
  if (view === "all") return true;
  if (view === "confirmed") return !!currentRevision(work);
  return needsAttention(work);
}
export function sortQueue(works: Work[]) {
  return [...works].sort(
    (a, b) =>
      urgency.indexOf(a.status) - urgency.indexOf(b.status) ||
      b.createdAt.localeCompare(a.createdAt),
  );
}
function pluralWord(count: number, [one, few, many]: [string, string, string]) {
  const tens = count % 100;
  const units = count % 10;
  if (tens > 10 && tens < 20) return many;
  if (units === 1) return one;
  if (units > 1 && units < 5) return few;
  return many;
}
export function plural(count: number, forms: [string, string, string]) {
  return `${count} ${pluralWord(count, forms)}`;
}

export type StudentSignal = { key: "gaps" | WorkStatus; count: number; label: string };
export function studentSignals(state: StoreState, studentId: string): StudentSignal[] {
  const works = state.works.filter((work) => work.studentId === studentId);
  const count = (status: WorkStatus) => works.filter((work) => work.status === status).length;
  const signals: StudentSignal[] = [
    {
      key: "gaps",
      count: deriveGaps(state, studentId).filter((gap) => !gap.closed).length,
      label: "",
    },
    { key: "failed", count: count("failed"), label: "без разбора" },
    { key: "needs_input", count: count("needs_input"), label: "к сверке" },
    { key: "ready", count: count("ready"), label: "к проверке" },
    { key: "preparation", count: count("preparation"), label: "в подготовке" },
  ];
  return signals
    .filter((signal) => signal.count)
    .map((signal) => ({
      ...signal,
      label:
        signal.key === "gaps"
          ? plural(signal.count, ["пробел", "пробела", "пробелов"])
          : `${signal.count} ${signal.label}`,
    }));
}

export const topicShortName = (topic: Topic) => topic.shortName ?? topic.name;

export type TopicStatus = "gap" | "closed" | "path" | "none";
export const topicStatusLabel: Record<TopicStatus, string> = {
  gap: "Пробел",
  closed: "Пробел закрыт",
  path: "Ведёт к пробелу",
  none: "Нет данных",
};
export type TopicCell = { topicId: string; name: string; status: TopicStatus; target: string };
export function topicStrip(
  state: StoreState,
  studentId: string,
  topicList: Topic[],
  catalog: Topic[] = topicList,
): TopicCell[] {
  const gaps = deriveGaps(state, studentId);
  const open = gaps.filter((gap) => !gap.closed).map((gap) => gap.topicId);
  const closed = new Set(gaps.filter((gap) => gap.closed).map((gap) => gap.topicId));
  const byId = new Map(catalog.map((topic) => [topic.id, topic]));
  const pathTarget = new Map<string, string>();
  const visit = (id: string, gap: string) =>
    byId.get(id)?.prerequisites.forEach((parent) => {
      if (!pathTarget.has(parent)) {
        pathTarget.set(parent, gap);
        visit(parent, gap);
      }
    });
  open.forEach((gap) => visit(gap, gap));
  const statusOf = (topicId: string): TopicStatus => {
    if (open.includes(topicId)) return "gap";
    if (closed.has(topicId)) return "closed";
    if (pathTarget.has(topicId)) return "path";
    return "none";
  };
  return topicList.map((topic) => {
    const status = statusOf(topic.id);
    const target = status === "path" ? pathTarget.get(topic.id)! : topic.id;
    return { topicId: topic.id, name: topic.name, status, target };
  });
}
