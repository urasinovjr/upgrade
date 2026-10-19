import { describe, expect, it } from "vitest";
import { seedState, topics } from "../data/fixtures";
import { deriveDashboard } from "./dashboard";
import { beginRevision, publishWork } from "./review";

describe("dashboard from confirmed evidence", () => {
  it("keeps counts stable across editions and removes withdrawn evidence", () => {
    const state = seedState();
    const initial = deriveDashboard(state, topics);
    expect([
      initial.awaiting,
      initial.needsInput,
      initial.confirmed,
      initial.studentCount,
      initial.openGaps,
    ]).toEqual([1, 1, 1, 4, 1]);
    const next = beginRevision(state.works[1]);
    next.draft.tasks.forEach((task) => (task.reviewed = true));
    next.draft.tasks.push({ ...structuredClone(next.draft.tasks[1]), id: "another-error" });
    state.works[1] = next;
    expect(deriveDashboard(state, topics).confirmed).toBe(1);
    state.works[1] = publishWork(next);
    const replaced = deriveDashboard(state, topics);
    expect(replaced.openGaps).toBe(1);
    expect(replaced.recommendations[0].gap.evidence).toHaveLength(2);
    state.works[1] = { ...state.works[1], currentPublishedId: undefined };
    expect(deriveDashboard(state, topics).confirmed).toBe(0);
    expect(deriveDashboard(state, topics).openGaps).toBe(0);
    expect(state.works[1].published).toHaveLength(2);
  });
  it("lists every open gap per student, respects closure/reopening and ignores hypotheses", () => {
    const state = seedState();
    const other = structuredClone(state.works[1]);
    other.id = "other-confirmed";
    other.studentId = "mikhail";
    state.works.push(other);
    const both = deriveDashboard(state, topics);
    expect(both.openGaps).toBe(2);
    expect(both.recommendations.map(({ student, topicName }) => [student.id, topicName])).toEqual([
      ["anna", "Область допустимых значений"],
      ["mikhail", "Область допустимых значений"],
    ]);
    state.closures.push({
      studentId: "anna",
      topicId: "domain",
      note: "Повторные задачи решены верно",
      at: "2026-09-30",
      action: "close",
    });
    const closed = deriveDashboard(state, topics);
    expect(closed.openGaps).toBe(1);
    expect(closed.recommendations[0].student.id).toBe("mikhail");
    state.closures.push({ ...state.closures[0], action: "reopen", at: "2026-10-01" });
    expect(deriveDashboard(state, topics).openGaps).toBe(2);
    const rejected = beginRevision(other);
    rejected.draft.tasks.forEach((task) => (task.reviewed = true));
    rejected.draft.tasks[1].gap!.decision = "rejected";
    state.works[state.works.length - 1] = publishWork(rejected);
    expect(deriveDashboard(state, topics).openGaps).toBe(1);
  });
  it("keeps a confirmed work counted while its new edition waits for the tutor", () => {
    const state = seedState();
    state.works[1] = beginRevision(state.works[1]);
    state.works[0] = { ...state.works[0], status: "processing" };
    const summary = deriveDashboard(state, topics);
    expect([summary.awaiting, summary.confirmed]).toEqual([1, 1]);
  });
  it("handles an empty store without mutating saved state", () => {
    expect(deriveDashboard({ works: [], students: [], closures: [] }, topics)).toEqual({
      awaiting: 0,
      needsInput: 0,
      confirmed: 0,
      studentCount: 0,
      openGaps: 0,
      recommendations: [],
    });
    const state = seedState();
    state.works.reverse();
    const before = structuredClone(state);
    deriveDashboard(state, topics);
    expect(state).toEqual(before);
  });
});
