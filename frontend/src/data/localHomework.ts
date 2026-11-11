import type {
  Homework,
  HomeworkGateway,
  HomeworkJob,
  HomeworkTask,
  Material,
} from "../domain/homework";
import type { Work } from "../domain/models";
import { newHomeworkTask } from "../domain/homework";
import { currentRevision } from "../domain/review";
import { localGateway, openDemoDatabase } from "./localGateway";
import { decodeUpload } from "../shared/uploads";

const key = "homework";

async function change(update: (items: Homework[]) => Homework[]) {
  const db = await openDemoDatabase();
  const tx = db.transaction("preferences", "readwrite");
  const items = ((await tx.store.get(key)) ?? []) as Homework[];
  const next = update(items);
  await tx.store.put(next, key);
  await tx.done;
  return next;
}
function find(items: Homework[], id: string) {
  const item = items.find((item) => item.id === id);
  if (!item) throw new Error("ДЗ не найдено. Откройте список ДЗ");
  return item;
}
function editable(item: Homework) {
  if (item.assignedAt) throw new Error("ДЗ уже назначено. Создайте копию для исправлений");
}
async function edit(id: string, update: (item: Homework) => Homework) {
  const items = await change((items) =>
    items.map((item) => (item.id === id ? update(item) : item)),
  );
  return find(items, id);
}
async function saveJob(job: HomeworkJob) {
  const db = await openDemoDatabase();
  await db.put("preferences", job, "homework-job-" + job.id);
  return job;
}
export function demoMaterial(): Material {
  return {
    explanation: "Пример отработки дробей. При сложении приведите дроби к общему знаменателю.",
    exercises: [
      {
        condition: "Вычислите 1/2 + 1/3.",
        answer: "5/6",
        solution: "1/2 + 1/3 = 3/6 + 2/6 = 5/6.",
      },
      {
        condition: "Вычислите 1/4 + 1/6.",
        answer: "5/12",
        solution: "1/4 + 1/6 = 3/12 + 2/12 = 5/12.",
      },
      {
        condition: "Вычислите 2/3 + 3/4.",
        answer: "17/12",
        solution: "2/3 + 3/4 = 8/12 + 9/12 = 17/12.",
      },
    ],
  };
}

export const localHomework: HomeworkGateway = {
  async list() {
    const db = await openDemoDatabase();
    const items = ((await db.get("preferences", key)) ?? []) as Homework[];
    return items.map((item) => ({
      ...item,
      files: [...item.files].sort(
        (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
      ),
    }));
  },
  async save(id, data) {
    const state = await this.list();
    const previous = state.find((item) => item.id === id);
    if (previous) editable(previous);
    if ((previous?.revision ?? 0) !== data.baseRevision)
      throw new Error("ДЗ изменено в другой вкладке. Обновите страницу");
    const next: Homework = {
      id,
      title: data.title,
      revision: data.baseRevision + 1,
      tasks: structuredClone(data.tasks),
      sourceText: data.sourceText ?? previous?.sourceText ?? "",
      recognitionJobId: previous?.recognitionJobId,
      createdAt: previous?.createdAt ?? new Date().toISOString(),
      assignedAt: null,
      deadline: null,
      files: previous?.files ?? [],
      assignments: [],
    };
    await change((items) => [next, ...items.filter((item) => item.id !== id)]);
    return next;
  },
  async assign(id, studentIds, deadline, revision) {
    const students = (await localGateway.read()).students;
    if (
      !studentIds.length ||
      studentIds.some((id) => !students.some((student) => student.id === id && !student.archivedAt))
    )
      throw new Error("Выберите учеников");
    return edit(id, (item) => {
      editable(item);
      if (item.revision !== revision) throw new Error("ДЗ изменено. Обновите страницу");
      if (!item.tasks.length || item.tasks.some((task) => !task.confirmed))
        throw new Error("Подтвердите каждое условие");
      return {
        ...item,
        revision: item.revision + 1,
        assignedAt: new Date().toISOString(),
        deadline,
        assignments: [...new Set(studentIds)].map((studentId) => ({
          id: crypto.randomUUID(),
          studentId,
        })),
      };
    });
  },
  deadline: (id, deadline) => edit(id, (item) => ({ ...item, deadline })),
  async copy(id) {
    const source = find(await this.list(), id);
    const copied = {
      ...structuredClone(source),
      id: crypto.randomUUID(),
      revision: 1,
      assignedAt: null,
      deadline: null,
      assignments: [],
      createdAt: new Date().toISOString(),
      recognitionJobId: null,
    };
    await change((items) => [copied, ...items]);
    return copied;
  },
  async upload(id, file) {
    const upload = await decodeUpload(file);
    const db = await openDemoDatabase();
    await db.put(
      "files",
      { bytes: new Uint8Array(await file.arrayBuffer()), type: file.type },
      upload.id,
    );
    return edit(id, (item) => {
      editable(item);
      return {
        ...item,
        revision: item.revision + 1,
        files: [
          ...item.files,
          {
            id: upload.id,
            name: upload.name,
            type: upload.type,
            pages: upload.pages,
            masks: {},
            checkedPages: [],
          },
        ],
      };
    });
  },
  async layout(id, file) {
    return edit(id, (item) => {
      editable(item);
      const previous = item.files.find((item) => item.id === file.id);
      if (!previous) throw new Error("Файл не найден. Загрузите его заново");
      const changed = JSON.stringify(previous.masks) !== JSON.stringify(file.masks);
      const next = {
        ...file,
        checkedPages: file.checkedPages.filter(
          (page) =>
            JSON.stringify(previous.masks[String(page)] ?? []) ===
            JSON.stringify(file.masks[String(page)] ?? []),
        ),
      };
      return {
        ...item,
        revision: item.revision + (changed ? 1 : 0),
        tasks: changed ? item.tasks.map((task) => ({ ...task, confirmed: false })) : item.tasks,
        files: item.files.map((file) => (file.id === next.id ? next : file)),
      };
    });
  },
  asset: (id) => localGateway.asset(id),
  async recognize(id, text, fileIds, revision) {
    const homework = find(await this.list(), id);
    editable(homework);
    if (homework.revision !== revision) throw new Error("ДЗ изменено. Обновите страницу");
    if (
      fileIds.some((id) => {
        const file = homework.files.find((file) => file.id === id);
        return !file || file.checkedPages.length !== file.pages;
      })
    )
      throw new Error("Проверьте обезличивание каждой страницы");
    const tasks: HomeworkTask[] = text.trim()
      ? text
          .split(/\n\s*\n/)
          .filter((line) => line.trim())
          .map((condition, index) => ({
            ...newHomeworkTask(),
            title: "Задание " + (index + 1),
            condition,
          }))
      : [
          {
            ...newHomeworkTask(),
            condition: "В демо перепишите условие с оригинала.",
            conditionFileIds: fileIds,
          },
        ];
    const job = await saveJob({
      id: crypto.randomUUID(),
      kind: "condition_recognition",
      status: "ready",
      revision,
      result: { tasks },
      provenance: { demo: true },
    });
    await edit(id, (item) => ({ ...item, sourceText: text, recognitionJobId: job.id }));
    return job;
  },
  async job(id) {
    const job = await (await openDemoDatabase()).get("preferences", "homework-job-" + id);
    if (!job) throw new Error("Результат не найден");
    return job as HomeworkJob;
  },
  async invite(studentId) {
    return {
      login: "Демонстрационный вход",
      url:
        (import.meta.env.MODE === "standalone"
          ? location.href.split("#")[0] + "#"
          : location.origin) +
        "/student?demo=" +
        encodeURIComponent(studentId),
    };
  },
  async submit(assignmentId, submission, uploads) {
    const homework = (await this.list()).find((homework) =>
      homework.assignments.some((item) => item.id === assignmentId),
    );
    const assignment = homework?.assignments.find((item) => item.id === assignmentId);
    if (!homework || !assignment) throw new Error("Назначение не найдено");
    const state = await localGateway.read();
    const found = state.works.find((work) => work.id === submission.id);
    if (found) return found;
    const previous = state.works
      .filter((work) => work.assignmentId === assignmentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (previous && !currentRevision(previous))
      throw new Error("Дождитесь проверки предыдущей попытки");
    const now = new Date().toISOString();
    const conditionIds = [...new Set(homework.tasks.flatMap((task) => task.conditionFileIds))];
    const conditionUploads = await Promise.all(
      conditionIds.map(async (id) => {
        const file = homework.files.find((file) => file.id === id)!;
        const blob = await this.asset(id);
        return {
          ...file,
          id: crypto.randomUUID(),
          blob,
          size: blob.size,
          pageOrder: Array.from({ length: file.pages }, (_, i) => i + 1),
          crops: {},
        };
      }),
    );
    const copies = new Map(conditionIds.map((id, index) => [id, conditionUploads[index].id]));
    const work: Work = {
      id: submission.id,
      studentId: assignment.studentId,
      title: homework.title,
      createdAt: now,
      demo: false,
      status: "preparation",
      editing: true,
      manual: true,
      published: [],
      attachments: [...uploads, ...conditionUploads].map(({ blob, ...file }) => {
        void blob;
        return file;
      }),
      assignmentId,
      submissionSnapshot: {
        homeworkId: homework.id,
        title: homework.title,
        tasks: structuredClone(homework.tasks),
        revision: homework.revision,
        deadline: homework.deadline,
      },
      taskFiles: submission.taskFiles,
      submittedAt: now,
      late: Boolean(homework.deadline && now > homework.deadline),
      draft: {
        revision: 1,
        inputRevision: 1,
        analysedInputRevision: 0,
        feedback: "",
        tasks: homework.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          condition: task.condition,
          formula: task.formula,
          topicId: task.topicId,
          taskTypeId: task.taskTypeId,
          conditionAttachmentIds: task.conditionFileIds.map((id) => copies.get(id)!),
          solutionAttachmentIds: submission.taskFiles[task.id] ?? [],
          reference: "",
          steps: [],
          reviewed: false,
          omitted: !submission.taskFiles[task.id]?.length,
          feedback: submission.taskFiles[task.id]?.length ? "" : "Решение не прислано",
        })),
      },
    };
    await localGateway.create(work, [...uploads, ...conditionUploads]);
    return work;
  },
  async material(workId, taskId) {
    const work = (await localGateway.read()).works.find((work) => work.id === workId);
    const task = work && currentRevision(work)?.draft.tasks.find((task) => task.id === taskId);
    if (task?.gap?.decision !== "confirmed")
      throw new Error("Подтвердите гипотезу и опубликуйте результат");
    const job = await saveJob({
      id: crypto.randomUUID(),
      kind: "remediation",
      status: "ready",
      revision: 1,
      result: demoMaterial(),
      provenance: { demo: true },
    });
    const db = await openDemoDatabase();
    const key = "materials-" + workId;
    const ids = ((await db.get("preferences", key)) ?? []) as string[];
    await db.put("preferences", [job.id, ...ids], key);
    return job;
  },
  async materials(workId) {
    const db = await openDemoDatabase();
    const ids = ((await db.get("preferences", "materials-" + workId)) ?? []) as string[];
    return Promise.all(ids.map((id) => this.job(id)));
  },
  async saveMaterial(id, data) {
    const job = await this.job(id);
    return saveJob({ ...job, revision: job.revision + 1, result: data });
  },
};
