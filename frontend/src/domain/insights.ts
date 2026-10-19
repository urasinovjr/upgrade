import type { Closure, StoreState, Student, Task, Topic, Work } from "./models";
import { firstConfirmation, dayKey } from "./analytics";
import { currentRevision, deriveGaps } from "./review";

const hour = 3600000;
const day = 24 * hour;

function topicNamer(catalog: Topic[]) {
  const names = new Map(catalog.map((topic) => [topic.id, topic.name]));
  return (topicId: string) => names.get(topicId) ?? topicId;
}

export type TopicErrors = {
  topicId: string;
  name: string;
  steps: number;
  errors: number;
  share: number;
};
export function errorsByTopic(works: Work[], catalog: Topic[]): TopicErrors[] {
  const nameOf = topicNamer(catalog);
  const totals = new Map<string, TopicErrors>();
  for (const work of works) {
    const revision = currentRevision(work);
    if (!revision) continue;
    for (const task of revision.draft.tasks) {
      if (task.omitted || !task.steps.length) continue;
      const entry = totals.get(task.topicId) ?? {
        topicId: task.topicId,
        name: nameOf(task.topicId),
        steps: 0,
        errors: 0,
        share: 0,
      };
      entry.steps += task.steps.length;
      entry.errors += task.steps.filter((step) => step.verdict === "error").length;
      totals.set(task.topicId, entry);
    }
  }
  return [...totals.values()]
    .map((entry) => ({ ...entry, share: entry.errors / entry.steps }))
    .sort((a, b) => b.share - a.share || b.errors - a.errors || a.name.localeCompare(b.name, "ru"));
}

export type SpeedBucket = "hour" | "day" | "threeDays" | "week" | "more";
export const speedBuckets: Array<{ key: SpeedBucket; limit: number }> = [
  { key: "hour", limit: hour },
  { key: "day", limit: day },
  { key: "threeDays", limit: 3 * day },
  { key: "week", limit: 7 * day },
  { key: "more", limit: Infinity },
];
export function median(values: number[]) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
export function reviewSpeed(works: Work[]) {
  const durations = works.flatMap((work) => {
    const first = firstConfirmation(work);
    return first ? [Math.max(0, Date.parse(first) - Date.parse(work.createdAt))] : [];
  });
  const buckets = speedBuckets.map(({ key }) => ({ key, count: 0 }));
  for (const duration of durations)
    buckets[speedBuckets.findIndex(({ limit }) => duration <= limit)].count++;
  return { count: durations.length, median: median(durations), buckets };
}

export function weekStart(value: Date | string) {
  const date = new Date(value);
  return dayKey(
    new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7)),
  );
}
export function closuresByWeek(closures: Closure[], weeks = 8, now = new Date()) {
  const current = new Date(weekStart(now) + "T12:00:00");
  const result = Array.from({ length: weeks }, (_, index) => {
    const start = new Date(current);
    start.setDate(current.getDate() - (weeks - 1 - index) * 7);
    return { week: dayKey(start), closed: 0, reopened: 0 };
  });
  const lookup = new Map(result.map((entry) => [entry.week, entry]));
  for (const closure of closures) {
    const entry = lookup.get(weekStart(closure.at));
    if (entry) entry[closure.action === "close" ? "closed" : "reopened"]++;
  }
  return result;
}

export type InactiveStudent = { student: Student; lastWorkAt?: string; idleDays: number | null };
export function inactiveStudents(state: StoreState, days = 14, now = new Date()) {
  const result: InactiveStudent[] = [];
  for (const student of state.students) {
    const lastWorkAt = state.works
      .filter((work) => work.studentId === student.id)
      .reduce<string | undefined>(
        (last, work) => (!last || work.createdAt > last ? work.createdAt : last),
        undefined,
      );
    const idleDays = lastWorkAt ? Math.floor((now.getTime() - Date.parse(lastWorkAt)) / day) : null;
    if (idleDays === null || idleDays >= days) result.push({ student, lastWorkAt, idleDays });
  }
  return result.sort(
    (a, b) =>
      (b.idleDays ?? Infinity) - (a.idleDays ?? Infinity) ||
      a.student.name.localeCompare(b.student.name, "ru"),
  );
}

export function commonGaps(state: StoreState, catalog: Topic[]) {
  const nameOf = topicNamer(catalog);
  const byTopic = new Map<string, Student[]>();
  for (const student of state.students) {
    for (const gap of deriveGaps(state, student.id)) {
      if (gap.closed) continue;
      byTopic.set(gap.topicId, [...(byTopic.get(gap.topicId) ?? []), student]);
    }
  }
  return [...byTopic.entries()]
    .map(([topicId, students]) => ({ topicId, name: nameOf(topicId), students }))
    .sort((a, b) => b.students.length - a.students.length || a.name.localeCompare(b.name, "ru"));
}

export type PendingHypothesis = { work: Work; student?: Student; task: Task; topicName: string };
export function pendingHypotheses(state: StoreState, catalog: Topic[]): PendingHypothesis[] {
  const nameOf = topicNamer(catalog);
  const students = new Map(state.students.map((student) => [student.id, student]));
  const works = state.works
    .filter((work) => work.editing && !work.job)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const result: PendingHypothesis[] = [];
  for (const work of works) {
    for (const task of work.draft.tasks) {
      if (task.omitted || task.gap?.decision !== "hypothesis") continue;
      result.push({
        work,
        student: students.get(work.studentId),
        task,
        topicName: nameOf(task.gap.topicId),
      });
    }
  }
  return result;
}
