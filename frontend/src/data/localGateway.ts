import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Attachment, StoreState, Upload, Work } from "../domain/models";
import { defaultLayout, normalizeLayout } from "../domain/dashboardLayout";
import {
  applyDraft,
  beginRevision,
  currentRevision,
  finishJob,
  publishWork,
} from "../domain/review";
import { keptChecks, layoutChanged, redactionMessage, uncheckedPages } from "../domain/redaction";
import { nameMessage, namePlaces } from "../domain/nameGuard";
import { fixtureUploads, seedState } from "./fixtures";
import type { Gateway } from "./gateway";

interface DemoDatabase extends DBSchema {
  state: { key: string; value: StoreState };
  files: { key: string; value: Blob | { bytes: Uint8Array; type: string } };
  preferences: { key: string; value: unknown };
}
const layoutKey = "dashboard-layout";
let opening: Promise<IDBPDatabase<DemoDatabase>> | undefined;
function openDatabase() {
  opening ??= new Promise<IDBPDatabase<DemoDatabase>>((resolve, reject) => {
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
        void openDatabase().then((db) => db.close());
      },
    }).then(resolve, reject);
  });
  return opening;
}
async function storedFile(upload: Upload) {
  return {
    id: upload.id,
    bytes: new Uint8Array(await upload.blob.arrayBuffer()),
    type: upload.type,
  };
}
function needsMigration(state: StoreState) {
  return state.works.some(
    (work) =>
      work.attachments.some((file) => !file.masks || !file.checkedPages) ||
      work.published.some((revision) => !revision.attachments),
  );
}
function migratedFile(file: Attachment, demo: boolean): Attachment {
  return {
    ...file,
    masks: file.masks ?? {},
    checkedPages: file.checkedPages ?? (demo ? [...file.pageOrder] : []),
  };
}
function migrated(state: StoreState): StoreState {
  return {
    ...state,
    works: state.works.map((work) => {
      const attachments = work.attachments.map((file) => migratedFile(file, work.demo));
      const published = work.published.map((revision) => ({
        ...revision,
        attachments: (revision.attachments ?? attachments).map((file) =>
          migratedFile(file, work.demo),
        ),
      }));
      return { ...work, attachments, published };
    }),
  };
}
let initialization: Promise<void> | undefined;
async function initialize() {
  if (initialization) return initialization;
  initialization = (async () => {
    const db = await openDatabase();
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
      } else if (needsMigration(existing)) {
        await tx.objectStore("state").put(migrated(existing), "root");
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
  const db = await openDatabase();
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
async function removeFiles(works: Work[]) {
  const ids = works.flatMap((work) => [
    ...work.attachments.map((file) => file.id),
    ...work.published.flatMap((revision) => revision.attachments.map((file) => file.id)),
  ]);
  const db = await openDatabase();
  const tx = db.transaction("files", "readwrite");
  await Promise.all([...new Set(ids)].map((fileId) => tx.store.delete(fileId)));
  await tx.done;
}
export const localGateway: Gateway = {
  async read() {
    await initialize();
    const db = await openDatabase();
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
    const blob = await (await openDatabase()).get("files", id);
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
    const db = await openDatabase();
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
        if (uncheckedPages(work.attachments).length) throw new Error(redactionMessage);
        const student = state.students.find((item) => item.id === work.studentId);
        if (namePlaces(student?.name ?? "", work.draft.tasks).length) throw new Error(nameMessage);
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
        const stored = new Map(work.attachments.map((file) => [file.id, file]));
        const next = attachments.map((file) => {
          const before = stored.get(file.id);
          return { ...file, checkedPages: before ? keptChecks(before, file) : [] };
        });
        if (!layoutChanged(work.attachments, next)) return { ...work, attachments: next };
        return {
          ...work,
          attachments: next,
          draft: {
            ...work.draft,
            inputRevision: work.draft.inputRevision + 1,
            tasks: work.draft.tasks.map((task) => ({ ...task, reviewed: false })),
          },
        };
      }),
    );
  },
  async archiveStudent(id, archived) {
    await mutate((state) => ({
      ...state,
      students: state.students.map((student) =>
        student.id === id
          ? { ...student, archivedAt: archived ? new Date().toISOString() : undefined }
          : student,
      ),
    }));
  },
  async removeStudent(id) {
    const state = await this.read();
    const works = state.works.filter((work) => work.studentId === id);
    await removeFiles(works);
    await mutate((current) => ({
      students: current.students.filter((student) => student.id !== id),
      works: current.works.filter((work) => work.studentId !== id),
      closures: current.closures.filter((closure) => closure.studentId !== id),
    }));
  },
  async removeWork(id) {
    const state = await this.read();
    await removeFiles(state.works.filter((work) => work.id === id));
    await mutate((current) => ({
      ...current,
      works: current.works.filter((work) => work.id !== id),
    }));
  },
  async layout() {
    const stored = await (await openDatabase()).get("preferences", layoutKey);
    return stored === undefined ? defaultLayout() : normalizeLayout(stored);
  },
  async saveLayout(layout) {
    try {
      await (await openDatabase()).put("preferences", normalizeLayout(layout), layoutKey);
    } catch (cause) {
      throw storageError(cause);
    }
  },
};
