import { describe, expect, it } from "vitest";
import { seedState, topics } from "../data/fixtures";
import {
  closuresByWeek,
  commonGaps,
  errorsByTopic,
  inactiveStudents,
  median,
  pendingHypotheses,
  reviewSpeed,
  weekStart,
} from "./insights";
import type { Closure } from "./models";

describe("overview insights", () => {
  it("counts error steps per topic in confirmed revisions only", () => {
    const state = seedState();
    expect(errorsByTopic(state.works, topics)).toEqual([
      { topicId: "domain", name: "Область допустимых значений", steps: 2, errors: 1, share: 0.5 },
      { topicId: "equations", name: "Квадратные уравнения", steps: 2, errors: 0, share: 0 },
    ]);
    const confirmed = state.works.find((work) => work.id === "demo-confirmed")!;
    confirmed.published[0].draft.tasks[1].omitted = true;
    expect(errorsByTopic(state.works, topics).map((entry) => entry.topicId)).toEqual(["equations"]);
    confirmed.currentPublishedId = undefined;
    expect(errorsByTopic(state.works, topics)).toEqual([]);
  });
  it("measures the time to the first confirmation", () => {
    expect(median([])).toBeUndefined();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    const state = seedState();
    const speed = reviewSpeed(state.works);
    expect(speed.count).toBe(1);
    expect(Math.round(speed.median! / 3600000)).toBe(24);
    expect(speed.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(1);
    state.works[1].currentPublishedId = undefined;
    expect(reviewSpeed(state.works).count).toBe(1);
    const later = structuredClone(state.works[1]);
    later.createdAt = later.published[0].confirmedAt;
    expect(reviewSpeed([later]).buckets[0]).toEqual({ key: "hour", count: 1 });
    later.createdAt = new Date(Date.parse(later.createdAt) - 2 * 86400000).toISOString();
    expect(reviewSpeed([later]).buckets[2]).toEqual({ key: "threeDays", count: 1 });
  });
  it("groups closures by week, Monday first", () => {
    expect(weekStart("2026-10-18T12:00:00")).toBe("2026-10-12");
    expect(weekStart("2026-10-19T00:30:00")).toBe("2026-10-19");
    const closure = (at: string, action: Closure["action"]): Closure => ({
      studentId: "anna",
      topicId: "domain",
      note: "",
      at,
      action,
    });
    const weeks = closuresByWeek(
      [
        closure("2026-10-18T20:00:00", "close"),
        closure("2026-10-19T09:00:00", "reopen"),
        closure("2026-10-20T09:00:00", "close"),
        closure("2026-01-01T09:00:00", "close"),
      ],
      3,
      new Date("2026-10-21T12:00:00"),
    );
    expect(weeks).toEqual([
      { week: "2026-10-05", closed: 0, reopened: 0 },
      { week: "2026-10-12", closed: 1, reopened: 0 },
      { week: "2026-10-19", closed: 1, reopened: 1 },
    ]);
  });
  it("lists students who have not sent work for a while", () => {
    const state = seedState();
    expect(inactiveStudents(state)).toEqual([]);
    state.students.push({ id: "new", name: "Новый ученик", grade: 8, goal: "", color: "blue" });
    const later = new Date(Date.now() + 20 * 86400000);
    expect(
      inactiveStudents(state, 14, later).map(({ student, idleDays }) => [student.id, idleDays]),
    ).toEqual([
      ["new", null],
      ["ivan", 24],
      ["polina", 23],
      ["mikhail", 22],
      ["anna", 20],
    ]);
  });
  it("ranks topics by students with an open gap", () => {
    const state = seedState();
    const other = structuredClone(state.works[1]);
    other.id = "other-confirmed";
    other.studentId = "mikhail";
    state.works.push(other);
    expect(
      commonGaps(state, topics).map(({ topicId, students }) => [
        topicId,
        students.map((s) => s.id),
      ]),
    ).toEqual([["domain", ["anna", "mikhail"]]]);
    state.closures.push({
      studentId: "anna",
      topicId: "domain",
      note: "Повторили",
      at: new Date().toISOString(),
      action: "close",
    });
    expect(commonGaps(state, topics)[0].students.map((s) => s.id)).toEqual(["mikhail"]);
    state.closures.push({
      studentId: "mikhail",
      topicId: "domain",
      note: "Повторили",
      at: new Date().toISOString(),
      action: "close",
    });
    expect(commonGaps(state, topics)).toEqual([]);
  });
  it("lists gap hypotheses that wait for the tutor", () => {
    const state = seedState();
    const pending = pendingHypotheses(state, topics);
    expect(pending.map(({ work, task }) => [work.id, task.id])).toEqual([
      ["demo-ready", "t2"],
      ["demo-input", "t2"],
      ["demo-failed", "t2"],
      ["demo-preparation", "t2"],
    ]);
    expect(pending[0].topicName).toBe("Область допустимых значений");
    expect(pending[0].student?.name).toBe("Анна Соколова");
    state.works[0].job = {
      token: "t",
      inputRevision: 0,
      startedAt: 0,
      completesAt: 1,
      outcome: "ready",
    };
    state.works[2].draft.tasks[1].omitted = true;
    expect(pendingHypotheses(state, topics).map(({ work }) => work.id)).toEqual([
      "demo-failed",
      "demo-preparation",
    ]);
  });
});
