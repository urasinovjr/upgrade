import type {
  Attachment,
  Closure,
  Draft,
  Report,
  StoreState,
  Student,
  Upload,
  Work,
} from "../domain/models";
import { layoutChanged } from "../domain/redaction";
import { defaultLayout, normalizeLayout, type DashboardLayout } from "../domain/dashboardLayout";
import { request, requestBlob } from "./api";
import type { Gateway } from "./gateway";

const layoutPath = "/account/preferences/dashboard-layout";
const serverRevisions = new Map<string, number>();

function remember(work: Work) {
  serverRevisions.set(work.id, work.draft.revision);
  return work;
}

async function workRequest(path: string, method: string, json?: unknown) {
  remember(await request<Work>(path, { method, json }));
}

async function putLayout(id: string, attachments: Attachment[]) {
  const layout = attachments.map(({ id, pageOrder, crops, masks, checkedPages }) => ({
    id,
    pageOrder,
    crops,
    masks,
    checkedPages,
  }));
  await workRequest("/works/" + id + "/attachments", "PUT", layout);
}

export const httpGateway: Gateway = {
  async read() {
    const state = await request<StoreState>("/state");
    state.works.forEach(remember);
    return state;
  },
  asset(id) {
    return requestBlob("/files/" + id);
  },
  async student(student: Student) {
    const { name, grade, goal, color } = student;
    await request("/students/" + student.id, {
      method: "PUT",
      json: { name, grade, goal, color },
    });
  },
  async create(work: Work, uploads: Upload[]) {
    const meta = {
      id: work.id,
      studentId: work.studentId,
      title: work.title,
      attachments: uploads.map((upload) => ({ id: upload.id, name: upload.name })),
      tasks: work.draft.tasks,
    };
    const form = new FormData();
    form.append("meta", JSON.stringify(meta));
    for (const upload of uploads) form.append(upload.id, upload.blob, upload.name);
    const created = remember(await request<Work>("/works", { method: "POST", form }));
    const files: Attachment[] = uploads.map(({ blob, ...file }) => {
      void blob;
      return file;
    });
    if (layoutChanged(created.attachments, files))
      await putLayout(
        work.id,
        files.map((file) => ({ ...file, checkedPages: [] })),
      );
    if (files.some((file) => file.checkedPages.length)) await putLayout(work.id, files);
  },
  async draft(id: string, draft: Draft) {
    const saved = await request<{ revision: number }>("/works/" + id + "/draft", {
      method: "PUT",
      json: { baseRevision: serverRevisions.get(id) ?? draft.revision - 1, draft },
    });
    serverRevisions.set(id, saved.revision);
  },
  async action(id, action) {
    await workRequest("/works/" + id + "/actions/" + action, "POST");
  },
  async closure(closure: Closure) {
    const { topicId, action, note } = closure;
    await request("/students/" + closure.studentId + "/closures", {
      method: "POST",
      json: { topicId, action, note },
    });
  },
  report(id: string, revisionId?: string) {
    const query = revisionId ? "?revisionId=" + encodeURIComponent(revisionId) : "";
    return request<Report>("/works/" + id + "/report" + query);
  },
  async attachments(id, attachments) {
    await putLayout(id, attachments);
  },
  async archiveStudent(id: string, archived: boolean) {
    await request("/students/" + id + "/archive", { method: "POST", json: { archived } });
  },
  async removeStudent(id: string) {
    await request("/students/" + id, { method: "DELETE" });
  },
  async removeWork(id: string) {
    await request("/works/" + id, { method: "DELETE" });
    serverRevisions.delete(id);
  },
  async layout() {
    const stored = await request<unknown>(layoutPath);
    return stored === null ? defaultLayout() : normalizeLayout(stored);
  },
  async saveLayout(layout: DashboardLayout) {
    await request(layoutPath, { method: "PUT", json: normalizeLayout(layout) });
  },
};
