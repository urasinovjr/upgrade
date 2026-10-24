import { describe, expect, it } from "vitest";
import { topics } from "../data/catalog";
import { seedState } from "../data/fixtures";
import { catalogTopics } from "./knowledgeFragment";

const legacy = catalogTopics(topics, [
  "fractions",
  "powers",
  "domain",
  "equations",
  "roots",
  "inequalities",
  "logs",
]);
import {
  activity,
  dayKey,
  inQueueView,
  isDayKey,
  matchesActivity,
  needsAttention,
  plural,
  sortQueue,
  statusCounts,
  studentSignals,
  topicShortName,
  topicStrip,
} from "./analytics";
import type { Work } from "./models";
import { beginRevision } from "./review";

const now = new Date(2026, 9, 18, 14);
const stamp = (day: number, hour = 12) => new Date(2026, 9, day, hour).toISOString();
const makeWork = (day: number, confirmations: number[] = []): Work => {
  const template = seedState().works[0];
  return {
    ...template,
    createdAt: stamp(day),
    status: confirmations.length ? "confirmed" : "ready",
    published: confirmations.map((day, index) => ({
      id: String(index),
      number: index + 1,
      confirmedAt: stamp(day),
      draft: template.draft,
      attachments: template.attachments,
    })),
  };
};
describe("concept activity", () => {
  it("keeps fourteen local calendar days including today, even with no works", () => {
    const days = activity([], now);
    expect(days).toHaveLength(14);
    expect(days[0].day).toBe("2026-10-05");
    expect(days.at(-1)?.day).toBe("2026-10-18");
    expect(days.every((day) => day.created === 0 && day.confirmed === 0)).toBe(true);
  });
  it("includes both boundaries, excludes earlier and future events", () => {
    const days = activity([makeWork(4), makeWork(5), makeWork(18), makeWork(19)], now);
    expect(days.reduce((sum, day) => sum + day.created, 0)).toBe(2);
    expect(days[0].created).toBe(1);
    expect(days.at(-1)?.created).toBe(1);
  });
  it("counts only the first confirmation, regardless of revision order", () => {
    const days = activity([makeWork(2, [18, 6, 12]), makeWork(1, [4, 10])], now);
    expect(days.reduce((sum, day) => sum + day.confirmed, 0)).toBe(1);
    expect(days.find((day) => day.day === "2026-10-06")?.confirmed).toBe(1);
  });
  it("filters by created or first-confirmed day and intersects with current status", () => {
    const work = makeWork(5, [8, 18]);
    expect(matchesActivity(work, { day: "2026-10-05" })).toBe(true);
    expect(matchesActivity(work, { day: "2026-10-08", status: "confirmed" })).toBe(true);
    expect(matchesActivity(work, { day: "2026-10-18" })).toBe(false);
    expect(matchesActivity(work, { day: "2026-10-08", status: "ready" })).toBe(false);
    expect(matchesActivity(work, {})).toBe(true);
  });
  it("counts each work once in its current status, even after a revision reopens", () => {
    const work = { ...makeWork(5, [6, 7]), status: "ready" as const };
    expect([...statusCounts([work, makeWork(8, [9])])]).toEqual([
      ["ready", 1],
      ["confirmed", 1],
    ]);
    expect(statusCounts([]).size).toBe(0);
  });
  it("accepts only real calendar days as a day filter", () => {
    expect(isDayKey("2026-10-18")).toBe(true);
    expect(isDayKey("2028-02-29")).toBe(true);
    for (const value of ["2026-02-31", "2026-13-99", "2026-99-01", "2026-1-01", "", null])
      expect(isDayKey(value)).toBe(false);
  });
  it("uses local calendar dates across midnight and year boundaries", () => {
    expect(dayKey(new Date(2026, 0, 1, 0))).toBe("2026-01-01");
    expect(activity([], new Date(2026, 0, 1))[0].day).toBe("2025-12-19");
    const work = { ...makeWork(18), createdAt: stamp(5, 0) };
    expect(activity([work], now)[0].created).toBe(1);
  });
});

describe("overview queue", () => {
  it("puts the works that need the tutor first, most urgent first, newest first within a status", () => {
    const works = seedState().works;
    const older = { ...works[0], id: "older", createdAt: stamp(1) };
    const ordered = sortQueue([...works, older]);
    expect(ordered.map((work) => work.status)).toEqual([
      "failed",
      "needs_input",
      "ready",
      "ready",
      "preparation",
      "confirmed",
    ]);
    expect(ordered[3].id).toBe("older");
    expect(works.map((work) => work.id)[0]).toBe("demo-ready");
  });
  it("treats system-side statuses and confirmed works as not needing attention", () => {
    const work = seedState().works[0];
    expect(needsAttention({ ...work, status: "needs_input" })).toBe(true);
    expect(needsAttention({ ...work, status: "preparation" })).toBe(true);
    expect(needsAttention({ ...work, status: "processing" })).toBe(false);
    expect(needsAttention({ ...work, status: "queued" })).toBe(false);
    expect(needsAttention({ ...work, status: "confirmed" })).toBe(false);
  });
  it("splits the queue into views: waiting for the tutor, everything, confirmed revisions", () => {
    const works = seedState().works;
    const ids = (view: "attention" | "all" | "confirmed") =>
      works.filter((work) => inQueueView(work, view)).map((work) => work.id);
    expect(ids("all")).toHaveLength(works.length);
    expect(ids("confirmed")).toEqual(["demo-confirmed"]);
    expect(ids("attention")).toEqual([
      "demo-ready",
      "demo-input",
      "demo-failed",
      "demo-preparation",
    ]);
    const edited = beginRevision(works[1]);
    expect([inQueueView(edited, "confirmed"), inQueueView(edited, "attention")]).toEqual([
      true,
      true,
    ]);
  });
  it("declines Russian counters", () => {
    const forms: [string, string, string] = ["пробел", "пробела", "пробелов"];
    expect([1, 2, 5, 11, 12, 21, 24, 111].map((count) => plural(count, forms))).toEqual([
      "1 пробел",
      "2 пробела",
      "5 пробелов",
      "11 пробелов",
      "12 пробелов",
      "21 пробел",
      "24 пробела",
      "111 пробелов",
    ]);
  });
});
describe("student summary", () => {
  it("lists open gaps and works waiting for the tutor, without empty signals", () => {
    const state = seedState();
    expect(studentSignals(state, "anna").map((signal) => signal.label)).toEqual([
      "1 пробел",
      "1 к проверке",
    ]);
    expect(studentSignals(state, "mikhail").map((signal) => signal.key)).toEqual(["needs_input"]);
    expect(studentSignals(state, "polina").map((signal) => signal.label)).toEqual([
      "1 без разбора",
    ]);
    expect(studentSignals(state, "ivan").map((signal) => signal.label)).toEqual(["1 в подготовке"]);
    state.works = state.works.filter((work) => work.studentId !== "ivan");
    expect(studentSignals(state, "ivan")).toEqual([]);
  });
  it("stops counting a gap once it is closed", () => {
    const state = seedState();
    state.closures.push({
      studentId: "anna",
      topicId: "domain",
      note: "Повторили",
      at: stamp(18),
      action: "close",
    });
    expect(studentSignals(state, "anna").map((signal) => signal.key)).toEqual(["ready"]);
  });
  it("marks one cell per topic: gap, its prerequisites and missing data, like the map", () => {
    const strip = topicStrip(seedState(), "anna", legacy, topics);
    expect(strip.map((cell) => cell.topicId)).toEqual(legacy.map((topic) => topic.id));
    expect(Object.fromEntries(strip.map((cell) => [cell.topicId, cell.status]))).toEqual({
      fractions: "path",
      powers: "path",
      domain: "gap",
      equations: "none",
      inequalities: "none",
      roots: "none",
      logs: "none",
    });
    expect(strip.filter((cell) => cell.status === "path").map((cell) => cell.target)).toEqual([
      "domain",
      "domain",
    ]);
    expect(strip.find((cell) => cell.topicId === "domain")?.target).toBe("domain");
    expect(
      topicStrip(seedState(), "ivan", legacy, topics).every((cell) => cell.status === "none"),
    ).toBe(true);
  });
  it("shows a closed gap as closed and drops the prerequisite path it implied", () => {
    const state = seedState();
    state.closures.push({
      studentId: "anna",
      topicId: "domain",
      note: "",
      at: stamp(18),
      action: "close",
    });
    const statuses = topicStrip(state, "anna", legacy, topics).map((cell) => cell.status);
    expect(statuses).toEqual(["none", "none", "closed", "none", "none", "none", "none"]);
  });
  it("labels topic columns with the short name, or the full name when none is set", () => {
    expect(legacy.map(topicShortName)).toEqual([
      "Дроби",
      "Степ.",
      "ОДЗ",
      "Кв. ур.",
      "Нер-ва",
      "Ирр.",
      "Лог.",
    ]);
    expect(topicShortName({ id: "x", name: "Тема", description: "", prerequisites: [] })).toBe(
      "Тема",
    );
  });
});
