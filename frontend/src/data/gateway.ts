import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Closure, Draft, Report, StoreState, Student, Upload, Work } from "../domain/models";
import { defaultLayout, normalizeLayout, type DashboardLayout } from "../domain/dashboardLayout";
import {
  applyDraft,
  beginRevision,
  currentRevision,
  finishJob,
  publishWork,
} from "../domain/review";
import { fixtureUploads, seedState } from "./fixtures";

interface DemoDatabase extends DBSchema {
  state: { key: string; value: StoreState };
  files: { key: string; value: Blob | { bytes: Uint8Array; type: string } };
  preferences: { key: string; value: unknown };
}
export interface Gateway {
  read(): Promise<StoreState>;
  asset(id: string): Promise<Blob>;
  student(student: Student): Promise<void>;
  create(work: Work, uploads: Upload[]): Promise<void>;
  draft(id: string, draft: Draft): Promise<void>;
  action(
    id: string,
    action: "analyse" | "manual" | "confirm" | "edit" | "withdraw",
    outcome?: "ready" | "failed" | "needs_input",
  ): Promise<void>;
  closure(closure: Closure): Promise<void>;
  report(id: string, revisionId?: string): Promise<Report>;
  attachments(id: string, attachments: Work["attachments"]): Promise<void>;
  layout(): Promise<DashboardLayout>;
  saveLayout(layout: DashboardLayout): Promise<void>;
}
const layoutKey = "dashboard-layout";
const database = new Promise<IDBPDatabase<DemoDatabase>>((resolve, reject) => {
  openDB<DemoDatabase>("upgrade-demo", 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore("state");
        db.createObjectStore("files");
      }
      if (oldVersion < 2) db.createObjectStore("preferences");
    },
    blocked() {
      reject(new Error("Закройте другие вкладки UpGrade и обновите страницу."));
    },
    blocking() {
      void database.then((db) => db.close());
    },
  }).then(resolve, reject);
});
async function storedFile(upload: Upload) {
  return {
    id: upload.id,
    bytes: new Uint8Array(await upload.blob.arrayBuffer()),
    type: upload.type,
  };
}
let initialization: Promise<void> | undefined;
async function initialize() {
  if (initialization) return initialization;
  initialization = (async () => {
    const db = await database;
    const seed = seedState();
    const files = await Promise.all(fixtureUploads(seed).map(storedFile));
    const tx = db.transaction(["state", "files"], "readwrite");
    void tx.done.catch(() => {});
    try {
      const existing = await tx.objectStore("state").get("root");
      if (!existing) {
        await tx.objectStore("state").put(seed, "root");
        for (const file of files)
          await tx.objectStore("files").put({ bytes: file.bytes, type: file.type }, file.id);
      } else if (
        existing.works.some((work) => work.published.some((revision) => !revision.attachments))
      ) {
        for (const work of existing.works)
          for (const revision of work.published) {
            revision.attachments ??= structuredClone(work.attachments);
          }
        await tx.objectStore("state").put(existing, "root");
      }
      await tx.done;
    } catch (cause) {
      throw await rollback(tx, cause);
    }
  })().catch((cause) => {
    initialization = undefined;
    throw cause;
  });
  return initialization;
}
function storageError(cause: unknown) {
  if (cause instanceof DOMException && cause.name === "QuotaExceededError")
    return new Error(
      "В браузере недостаточно места. Освободите место и повторите сохранение; изменения остаются на экране.",
    );
  return cause;
}
async function rollback(tx: { abort(): void; done: Promise<void> }, cause: unknown) {
  try {
    tx.abort();
  } catch {}
  await tx.done.catch(() => {});
  return storageError(cause);
}
async function mutate(change: (state: StoreState) => StoreState) {
  await initialize();
  const db = await database;
  const tx = db.transaction("state", "readwrite");
  void tx.done.catch(() => {});
  try {
    const state = await tx.store.get("root");
    if (!state) throw new Error("Не удалось открыть данные.");
    await tx.store.put(change(state), "root");
    await tx.done;
  } catch (cause) {
    throw await rollback(tx, cause);
  }
}
const queueDelay = 700;
function hasDueJob(work: Work) {
  if (!work.job) return false;
  const finished = Date.now() >= work.job.completesAt;
  const leftQueue = work.status === "queued" && Date.now() - work.job.startedAt > queueDelay;
  return finished || leftQueue;
}
function updateWork(state: StoreState, id: string, change: (work: Work) => Work) {
  if (!state.works.some((work) => work.id === id)) throw new Error("Работа не найдена.");
  return { ...state, works: state.works.map((work) => (work.id === id ? change(work) : work)) };
}
export const gateway: Gateway = {
  async read() {
    await initialize();
    const db = await database;
    let state = await db.get("state", "root");
    if (!state) throw new Error("Данные недоступны.");
    if (state.works.some(hasDueJob)) {
      await mutate((state) => ({
        ...state,
        works: state.works.map((work) => {
          if (!work.job) return work;
          const finished = finishJob(work, work.job.token, Date.now());
          if (finished.job && Date.now() - finished.job.startedAt > queueDelay)
            return { ...finished, status: "processing" };
          return finished;
        }),
      }));
      state = await db.get("state", "root");
    }
    if (!state) throw new Error("Данные недоступны.");
    return state;
  },
  async asset(id) {
    await initialize();
    const blob = await (await database).get("files", id);
    if (!blob) throw new Error("Файл не найден. Добавьте его заново.");
    return blob instanceof Blob
      ? blob
      : new Blob([blob.bytes.slice().buffer as ArrayBuffer], { type: blob.type });
  },
  async student(student) {
    if (!student.name.trim()) throw new Error("Укажите имя ученика.");
    await mutate((state) => ({
      ...state,
      students: state.students.some((item) => item.id === student.id)
        ? state.students.map((item) => (item.id === student.id ? student : item))
        : [...state.students, student],
    }));
  },
  async create(work, uploads) {
    await initialize();
    const db = await database;
    const files = await Promise.all(uploads.map(storedFile));
    const tx = db.transaction(["state", "files"], "readwrite");
    void tx.done.catch(() => {});
    try {
      const state = await tx.objectStore("state").get("root");
      if (!state) throw new Error("Данные недоступны.");
      for (const file of files)
        await tx.objectStore("files").put({ bytes: file.bytes, type: file.type }, file.id);
      await tx.objectStore("state").put({ ...state, works: [work, ...state.works] }, "root");
      await tx.done;
    } catch (cause) {
      throw await rollback(tx, cause);
    }
  },
  async draft(id, draft) {
    await mutate((state) => updateWork(state, id, (work) => applyDraft(work, draft)));
  },
  async action(id, action, outcome = "ready") {
    await mutate((state) =>
      updateWork(state, id, (work) => {
        if (action === "confirm") return publishWork(work);
        if (action === "edit") return beginRevision(work);
        if (action === "withdraw")
          return { ...work, currentPublishedId: undefined, editing: true, status: "ready" };
        if (work.job) throw new Error("Обработка уже запущена.");
        if (!work.editing) throw new Error("Откройте новую редакцию.");
        if (action === "manual")
          return {
            ...work,
            manual: true,
            status: "ready",
            draft: { ...work.draft, analysedInputRevision: work.draft.inputRevision },
          };
        if (!work.demo)
          throw new Error(
            "Автоматический анализ пользовательских файлов будет доступен после подключения сервера. Сейчас доступен ручной разбор.",
          );
        const now = Date.now();
        return {
          ...work,
          status: "queued",
          job: {
            token: crypto.randomUUID(),
            inputRevision: work.draft.inputRevision,
            startedAt: now,
            completesAt: now + 2800,
            outcome,
          },
        };
      }),
    );
  },
  async closure(closure) {
    if (closure.action === "close" && !closure.note.trim())
      throw new Error("Укажите основание закрытия пробела.");
    await mutate((state) => ({ ...state, closures: [...state.closures, closure] }));
  },
  async report(id, revisionId) {
    const state = await this.read();
    const work = state.works.find((item) => item.id === id);
    const student = state.students.find((item) => item.id === work?.studentId);
    const revision =
      work &&
      (revisionId ? work.published.find((item) => item.id === revisionId) : currentRevision(work));
    if (!work || !student || !revision) throw new Error("Подтверждённый отчёт не найден.");
    return { work, student, revision };
  },
  async attachments(id, attachments) {
    await mutate((state) =>
      updateWork(state, id, (work) => {
        if (!work.editing || work.job)
          throw new Error("Редактирование оригинала сейчас недоступно.");
        return {
          ...work,
          attachments,
          draft: {
            ...work.draft,
            inputRevision: work.draft.inputRevision + 1,
            tasks: work.draft.tasks.map((task) => ({ ...task, reviewed: false })),
          },
        };
      }),
    );
  },
  async layout() {
    const stored = await (await database).get("preferences", layoutKey);
    return stored === undefined ? defaultLayout() : normalizeLayout(stored);
  },
  async saveLayout(layout) {
    try {
      await (await database).put("preferences", normalizeLayout(layout), layoutKey);
    } catch (cause) {
      throw storageError(cause);
    }
  },
};
