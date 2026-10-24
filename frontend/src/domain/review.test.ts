import { describe, expect, it } from "vitest";
import { seedState } from "../data/fixtures";
import {
  applyDraft,
  beginRevision,
  currentRevision,
  deriveGaps,
  finishJob,
  publishWork,
  reviewBlockers,
} from "./review";

describe("confirmation and versions", () => {
  it("requires human review, clear steps and current inputs", () => {
    const work = seedState().works[0];
    expect(reviewBlockers(work)).toContain("Задача 1: отметьте задачу проверенной.");
    const draft = structuredClone(work.draft);
    draft.tasks.forEach((task) => (task.reviewed = true));
    draft.tasks[0].steps[0].latex = "x=100";
    const changed = applyDraft(work, draft);
    expect(changed.draft.tasks[0].reviewed).toBe(false);
    expect(reviewBlockers(changed).some((value) => value.includes("Запустите разбор заново"))).toBe(
      true,
    );
  });
  it("counts a frame on a page as the condition and treats moving it as a new input", () => {
    const work = seedState().works[0];
    const fileId = work.attachments[0].id;
    const draft = structuredClone(work.draft);
    Object.assign(draft.tasks[0], { condition: "", formula: "", conditionAttachmentIds: [] });
    const blank = applyDraft(work, draft);
    expect(reviewBlockers(blank)).toContain("Задача 1: добавьте условие.");
    const framed = structuredClone(blank.draft);
    framed.tasks[0].conditionRegion = {
      fileId,
      page: 1,
      region: { x: 0, y: 0, width: 1, height: 0.2 },
    };
    const withFrame = applyDraft(blank, framed);
    expect(reviewBlockers(withFrame)).not.toContain("Задача 1: добавьте условие.");
    expect(withFrame.draft.inputRevision).toBe(blank.draft.inputRevision + 1);
  });
  it("keeps the previous confirmed snapshot while editing and publishes idempotently", () => {
    const original = seedState().works[1];
    const revision = currentRevision(original)!;
    const editing = beginRevision(original);
    editing.draft.tasks[0].feedback = "Новый комментарий";
    expect(currentRevision(editing)?.draft.tasks[0].feedback).toBe(
      revision.draft.tasks[0].feedback,
    );
    editing.draft.tasks.forEach((task) => (task.reviewed = true));
    const replacement = publishWork(editing);
    expect(replacement.published).toHaveLength(2);
    expect(currentRevision(replacement)?.number).toBe(2);
    expect(publishWork(replacement)).toBe(replacement);
  });
  it("counts only the latest confirmed evidence and excludes a rejected replacement", () => {
    const state = seedState();
    const original = state.works[1];
    const next = beginRevision(original);
    next.draft.tasks.forEach((task) => (task.reviewed = true));
    const replacement = publishWork(next);
    state.works[1] = replacement;
    expect(deriveGaps(state, "anna")[0].evidence).toHaveLength(1);
    const rejected = beginRevision(replacement);
    rejected.draft.tasks[1].gap!.decision = "rejected";
    rejected.draft.tasks.forEach((task) => (task.reviewed = true));
    state.works[1] = publishWork(rejected);
    expect(deriveGaps(state, "anna")).toHaveLength(0);
    state.works[1] = { ...original, currentPublishedId: undefined };
    expect(deriveGaps(state, "anna")).toHaveLength(0);
    expect(state.works[1].published).toHaveLength(1);
  });
  it("retains closure history and respects reopening", () => {
    const state = seedState();
    state.closures.push({
      studentId: "anna",
      topicId: "domain",
      note: "Три задачи без ошибок",
      at: "2026-09-30",
      action: "close",
    });
    expect(deriveGaps(state, "anna")[0].closed).toBe(true);
    state.closures.push({
      studentId: "anna",
      topicId: "domain",
      note: "Повторная ошибка",
      at: "2026-10-01",
      action: "reopen",
    });
    expect(deriveGaps(state, "anna")[0].closed).toBe(false);
    expect(state.closures).toHaveLength(2);
  });
  it("does not approve uncertain, failed or unexplained analyses", () => {
    const work = seedState().works[0];
    work.draft.tasks.forEach((task) => (task.reviewed = true));
    work.draft.tasks[0].steps[0].verdict = "uncertain";
    expect(() => publishWork(work)).toThrow("уточните");
    work.draft.tasks[0].steps[0].verdict = "correct";
    work.status = "failed";
    expect(() => publishWork(work)).toThrow("сверьте работу с оригиналом");
    work.status = "ready";
    work.draft.tasks[1].steps[1].explanation = "";
    expect(() => publishWork(work)).toThrow("объясните ошибку");
  });
});
describe("processing responses", () => {
  it("ignores obsolete tokens and waits until completion", () => {
    const work = seedState().works[0];
    work.job = {
      token: "current",
      inputRevision: 0,
      startedAt: 0,
      completesAt: 100,
      outcome: "ready",
    };
    expect(finishJob(work, "old", 200)).toBe(work);
    expect(finishJob(work, "current", 50)).toBe(work);
    expect(finishJob(work, "current", 200).job).toBeUndefined();
  });
  it("does not accept a result for changed inputs", () => {
    const work = seedState().works[0];
    work.draft.inputRevision = 2;
    work.job = {
      token: "current",
      inputRevision: 1,
      startedAt: 0,
      completesAt: 100,
      outcome: "ready",
    };
    const result = finishJob(work, "current", 200);
    expect(result.status).toBe("needs_input");
    expect(result.draft.analysedInputRevision).toBe(0);
  });
});
