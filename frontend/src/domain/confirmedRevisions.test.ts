import { describe, expect, it } from "vitest";
import { seedState, topics } from "../data/fixtures";
import { topicStrip } from "./analytics";
import { deriveDashboard } from "./dashboard";
import { commonGaps, errorsByTopic } from "./insights";
import type { StoreState, Work } from "./models";
import { beginRevision, currentRevision, deriveGaps, publishWork, reportText } from "./review";

function confirmedWork(state: StoreState): Work {
  return state.works.find((work) => work.id === "demo-confirmed")!;
}

function republished(work: Work): Work {
  const editing = beginRevision(work);
  const reviewed = {
    ...editing,
    draft: {
      ...editing.draft,
      tasks: editing.draft.tasks.map((task) => ({ ...task, reviewed: true })),
    },
  };
  return publishWork(reviewed);
}

describe("confirmed revisions", () => {
  it("keeps a hypothesis out of gaps, overview, map and report until it is accepted", () => {
    const state = seedState();
    const work = confirmedWork(state);
    expect(deriveGaps(state, "anna").map((gap) => gap.topicId)).toEqual(["domain"]);

    currentRevision(work)!.draft.tasks[1].gap!.decision = "hypothesis";
    const summary = deriveDashboard(state, topics);
    const student = state.students.find((item) => item.id === "anna")!;
    const text = reportText({ work, student, revision: currentRevision(work)! });

    expect(deriveGaps(state, "anna")).toEqual([]);
    expect(summary.openGaps).toBe(0);
    expect(summary.recommendations).toEqual([]);
    expect(commonGaps(state, topics)).toEqual([]);
    expect(topicStrip(state, "anna", topics).some((cell) => cell.status === "gap")).toBe(false);
    expect(text).not.toContain("Рекомендация:");
  });

  it("counts errors and evidence once after a new revision replaces the old one", () => {
    const state = seedState();
    const before = errorsByTopic(state.works, topics);
    const index = state.works.findIndex((work) => work.id === "demo-confirmed");

    state.works[index] = republished(state.works[index]);
    const [gap] = deriveGaps(state, "anna");

    expect(state.works[index].published.map((revision) => revision.number)).toEqual([1, 2]);
    expect(errorsByTopic(state.works, topics)).toEqual(before);
    expect(gap.evidence).toHaveLength(1);
    expect(gap.evidence[0].revisionId).toBe(state.works[index].currentPublishedId);
    expect(deriveDashboard(state, topics).confirmed).toBe(1);
  });

  it("does not close a gap because a later work has no errors", () => {
    const state = seedState();
    const clean = structuredClone(confirmedWork(state));
    const revision = currentRevision(clean)!;
    clean.id = "later-clean";
    revision.draft.tasks = revision.draft.tasks.map((task) => ({
      ...task,
      gap: undefined,
      steps: task.steps.map((step) => ({ ...step, verdict: "correct", explanation: "" })),
    }));
    state.works.push(clean);

    const gaps = deriveGaps(state, "anna");

    expect(gaps.map((gap) => [gap.topicId, gap.closed])).toEqual([["domain", false]]);
    expect(deriveDashboard(state, topics).openGaps).toBe(1);
  });
});
