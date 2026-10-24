import type { StoreState, Topic } from "./models";
import { currentRevision } from "./review";

export function studentTopicIds(state: StoreState, studentId: string): Set<string> {
  const ids = new Set<string>();
  for (const work of state.works.filter((item) => item.studentId === studentId)) {
    const revision = currentRevision(work);
    if (!revision) continue;
    for (const task of revision.draft.tasks) {
      if (task.omitted) continue;
      ids.add(task.topicId);
      if (task.gap?.decision === "confirmed") ids.add(task.gap.topicId);
    }
  }
  for (const closure of state.closures)
    if (closure.studentId === studentId) ids.add(closure.topicId);
  return ids;
}

export function knowledgeFragment(catalog: Topic[], ids: Iterable<string>): Topic[] {
  const byId = new Map(catalog.map((topic) => [topic.id, topic]));
  const chosen = new Set<string>();
  for (const id of ids) {
    const topic = byId.get(id);
    if (!topic) continue;
    chosen.add(topic.id);
    topic.prerequisites.forEach((parent) => chosen.add(parent));
  }
  return catalog.filter((topic) => chosen.has(topic.id));
}

export function catalogTopics(catalog: Topic[], ids: Iterable<string>): Topic[] {
  const chosen = new Set(ids);
  return catalog.filter((topic) => chosen.has(topic.id));
}

export function gradeTitle(grades: number[]): string {
  const known = grades.filter((grade) => grade > 0);
  if (!known.length) return "Темы";
  const low = Math.min(...known);
  const high = Math.max(...known);
  return (low === high ? String(low) : low + "–" + high) + " класс";
}
