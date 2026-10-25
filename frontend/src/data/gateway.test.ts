import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { openDB } from "idb";
import { gateway } from "./gateway";
import type { Work } from "../domain/models";
import { blankTask, reportText } from "../domain/review";
import { addWidget, defaultLayout, removeWidget } from "../domain/dashboardLayout";
import { emptyOnboarding, withHintSeen, withTourOutcome } from "../domain/onboarding";

function customWork(): Work {
  const task = blankTask(1);
  task.condition = "Решите уравнение x + 1 = 2";
  task.steps[0] = { ...task.steps[0], latex: "x=1", verdict: "correct" };
  return {
    id: crypto.randomUUID(),
    studentId: "anna",
    title: "Ручная проверка",
    createdAt: new Date().toISOString(),
    demo: false,
    status: "preparation",
    editing: true,
    manual: true,
    published: [],
    attachments: [],
    draft: {
      revision: 1,
      inputRevision: 0,
      analysedInputRevision: -1,
      tasks: [task],
      feedback: "",
    },
  };
}
describe("demo persistence", () => {
  it("stores custom files, rejects simulated AI for them and exports the confirmed snapshot", async () => {
    const work = customWork();
    const id = crypto.randomUUID();
    const blob = new Blob(["local file"], { type: "image/png" });
    work.attachments = [
      {
        id,
        name: "local.png",
        type: "image/png",
        size: blob.size,
        pages: 1,
        pageOrder: [1],
        crops: {},
        masks: {},
        checkedPages: [],
      },
    ];
    await gateway.create(work, [{ ...work.attachments[0], blob }]);
    expect(await (await gateway.asset(id)).text()).toBe("local file");
    await expect(gateway.action(work.id, "analyse")).rejects.toThrow("проверить вручную");
    await gateway.action(work.id, "manual");
    const state = await gateway.read();
    const draft = state.works.find((item) => item.id === work.id)!.draft;
    draft.tasks[0].reviewed = true;
    await gateway.draft(work.id, draft);
    await gateway.action(work.id, "confirm");
    const report = await gateway.report(work.id);
    expect(report.revision.number).toBe(1);
    await gateway.action(work.id, "edit");
    const editing = (await gateway.read()).works.find((item) => item.id === work.id)!;
    editing.draft.feedback = "Новый черновик";
    await gateway.draft(work.id, editing.draft);
    expect((await gateway.report(work.id)).revision.draft.feedback).toBe("");
    await gateway.action(work.id, "withdraw");
    await expect(gateway.report(work.id)).rejects.toThrow("не найден");
    expect((await gateway.report(work.id, report.revision.id)).revision.number).toBe(1);
  });
  it("rolls back files when the state write fails, then allows retry", async () => {
    await gateway.read();
    const work = customWork();
    const id = crypto.randomUUID();
    const blob = new Blob(["test"]);
    const file = {
      id,
      name: "test.png",
      type: "image/png",
      size: 4,
      pages: 1,
      pageOrder: [1],
      crops: {},
      masks: {},
      checkedPages: [],
      blob,
    };
    const original = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<typeof original>
    ) {
      if (this.name === "state") throw new DOMException("Full", "QuotaExceededError");
      return original.apply(this, args);
    });
    try {
      await expect(gateway.create(work, [file])).rejects.toThrow("закончилось место");
    } finally {
      spy.mockRestore();
    }
    await expect(gateway.asset(id)).rejects.toThrow("не найден");
    expect((await gateway.read()).works.find((item) => item.id === work.id)).toBeUndefined();
    await gateway.create(work, [file]);
    expect((await gateway.read()).works.find((item) => item.id === work.id)).toBeDefined();
  });
  it("keeps the draft on a page check and waits for checks before the demo analysis", async () => {
    const before = (await gateway.read()).works.find((item) => item.id === "demo-ready")!;
    const [sheet] = before.attachments;
    const mask = { x: 0, y: 0, width: 0.4, height: 0.1 };

    await gateway.attachments(before.id, [{ ...sheet, masks: { "1": [mask] } }]);
    const masked = (await gateway.read()).works.find((item) => item.id === before.id)!;
    const blocked = gateway.action(before.id, "analyse");
    await expect(blocked).rejects.toThrow("личные данные скрыты");
    await gateway.attachments(before.id, [{ ...masked.attachments[0], checkedPages: [1] }]);
    const checked = (await gateway.read()).works.find((item) => item.id === before.id)!;

    expect(masked.attachments[0].checkedPages).toEqual([]);
    expect(masked.draft.inputRevision).toBe(before.draft.inputRevision + 1);
    expect(checked.attachments[0].checkedPages).toEqual([1]);
    expect(checked.draft.inputRevision).toBe(masked.draft.inputRevision);
    await gateway.action(before.id, "analyse");
  });

  it("requires an explanation when closing a gap", async () => {
    await expect(
      gateway.closure({
        studentId: "anna",
        topicId: "domain",
        note: " ",
        at: new Date().toISOString(),
        action: "close",
      }),
    ).rejects.toThrow("почему пробел закрыт");
  });
  it("restores exports of earlier local snapshots without deleting their files", async () => {
    const state = await gateway.read();
    const work = state.works.find((item) => item.id === "demo-confirmed")!;
    Reflect.deleteProperty(work.published[0], "attachments");
    const db = await openDB("upgrade-demo");
    await db.put("state", state, "root");
    vi.resetModules();
    const restored = (await import("./gateway")).gateway;
    const report = await restored.report(work.id);
    expect(report.revision.attachments).toEqual(work.attachments);
    expect(reportText(report)).toContain(work.title);
    expect(await (await restored.asset(work.attachments[0].id)).text()).toContain("<svg");
    db.close();
  });
  it("archives a student and deletes works with their files", async () => {
    const work = customWork();
    const fileId = crypto.randomUUID();
    const blob = new Blob(["to delete"], { type: "image/png" });
    work.attachments = [
      {
        id: fileId,
        name: "x.png",
        type: "image/png",
        size: 9,
        pages: 1,
        pageOrder: [1],
        crops: {},
        masks: {},
        checkedPages: [],
      },
    ];
    await gateway.create(work, [{ ...work.attachments[0], blob }]);
    await gateway.archiveStudent(work.studentId, true);
    let state = await gateway.read();
    expect(state.students.find((item) => item.id === work.studentId)?.archivedAt).toBeTruthy();
    await gateway.removeWork(work.id);
    state = await gateway.read();
    expect(state.works.some((item) => item.id === work.id)).toBe(false);
    await expect(gateway.asset(fileId)).rejects.toThrow("Файл не найден");
    await gateway.archiveStudent(work.studentId, false);
    await gateway.removeStudent(work.studentId);
    state = await gateway.read();
    expect(state.students.some((item) => item.id === work.studentId)).toBe(false);
    expect(state.works.some((item) => item.studentId === work.studentId)).toBe(false);
  });
  it("keeps the overview layout apart from the work data", async () => {
    expect(await gateway.layout()).toEqual(defaultLayout());
    const layout = addWidget(removeWidget(defaultLayout(), "focus"), "hypotheses", 0);
    await gateway.saveLayout(layout);
    expect(await gateway.layout()).toEqual(layout);
    expect((await gateway.read()).works.length).toBeGreaterThan(0);
    const db = await openDB("upgrade-demo");
    await db.put(
      "preferences",
      { version: 1, items: [{ id: "queue", span: 5 }, "x"] },
      "dashboard-layout",
    );
    expect(await gateway.layout()).toEqual({ version: 1, items: [{ id: "queue", span: 6 }] });
    await db.put("preferences", { version: 7 }, "dashboard-layout");
    expect(await gateway.layout()).toEqual(defaultLayout());
    db.close();
  });
  it("keeps the onboarding apart from the layout", async () => {
    expect(await gateway.onboarding()).toEqual(emptyOnboarding());
    const onboarding = withHintSeen(withTourOutcome(emptyOnboarding(), "skipped"), "review");
    await gateway.saveOnboarding(onboarding);
    expect(await gateway.onboarding()).toEqual(onboarding);
    expect(await gateway.layout()).not.toHaveProperty("tour");
    const db = await openDB("upgrade-demo");
    await db.put(
      "preferences",
      { version: 1, tour: "later", hints: ["review", "x"] },
      "onboarding",
    );
    expect(await gateway.onboarding()).toEqual({ version: 1, tour: null, hints: ["review"] });
    db.close();
  });
  it("reports a full storage when the layout cannot be saved", async () => {
    const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    try {
      await expect(gateway.saveLayout(defaultLayout())).rejects.toThrow("закончилось место");
    } finally {
      spy.mockRestore();
    }
  });
});
