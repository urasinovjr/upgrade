import type { StoreState, Student, StudentGap, Topic, Work } from "./models";
import { currentRevision, deriveGaps } from "./review";

export interface DashboardSummary {
  awaiting: number;
  needsInput: number;
  confirmed: number;
  studentCount: number;
  openGaps: number;
  recommendations: Array<{ student: Student; gap: StudentGap; topicName: string }>;
}

export function deriveDashboard(state: StoreState, catalog: Topic[]): DashboardSummary {
  const names = new Map(catalog.map((topic) => [topic.id, topic.name]));
  const recommendations: DashboardSummary["recommendations"] = [];
  for (const student of state.students) {
    for (const gap of deriveGaps(state, student.id)) {
      if (gap.closed) continue;
      recommendations.push({
        student,
        gap,
        topicName: names.get(gap.topicId) || gap.topicId,
      });
    }
  }
  recommendations.sort(
    (a, b) =>
      b.gap.evidence.length - a.gap.evidence.length ||
      a.student.name.localeCompare(b.student.name, "ru") ||
      a.topicName.localeCompare(b.topicName, "ru"),
  );
  const count = (status: Work["status"]) =>
    state.works.filter((work) => work.status === status).length;
  return {
    awaiting: count("ready"),
    needsInput: count("needs_input"),
    confirmed: state.works.filter((work) => currentRevision(work)).length,
    studentCount: state.students.length,
    openGaps: recommendations.length,
    recommendations,
  };
}
