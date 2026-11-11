import type { HomeworkGateway } from "../domain/homework";
import { request, requestBlob } from "./api";

export const httpHomework: HomeworkGateway = {
  list: () => request("/homework"),
  save: (id, data) =>
    request("/homework/" + id, {
      method: "PUT",
      json: {
        ...data,
        tasks: data.tasks.map(({ examSuggestions, ...task }) => {
          void examSuggestions;
          return task;
        }),
      },
    }),
  assign: (id, studentIds, deadline, baseRevision) =>
    request("/homework/" + id + "/assign", {
      method: "POST",
      json: { studentIds, deadline, baseRevision },
    }),
  deadline: (id, deadline) =>
    request("/homework/" + id + "/deadline", { method: "PUT", json: { deadline } }),
  copy: (id) => request("/homework/" + id + "/copy", { method: "POST" }),
  upload: (id, file) => {
    const form = new FormData();
    form.append("file", file);
    return request("/homework/" + id + "/files", { method: "POST", form });
  },
  layout: (id, file) =>
    request("/homework/" + id + "/files/" + file.id, {
      method: "PUT",
      json: {
        id: file.id,
        masks: file.masks,
        checkedPages: file.checkedPages,
        pageOrder: Array.from({ length: file.pages }, (_, index) => index + 1),
        crops: {},
      },
    }),
  asset: (id) => requestBlob("/homework-files/" + id),
  recognize: (id, text, fileIds, baseRevision) =>
    request("/homework/" + id + "/recognize", {
      method: "POST",
      json: { text, fileIds, baseRevision },
    }),
  job: (id) => request("/homework-jobs/" + id),
  invite: (id) => request("/students/" + id + "/invitation", { method: "POST" }),
  submit: (id, data, uploads) => {
    const form = new FormData();
    form.append("meta", JSON.stringify(data));
    for (const upload of uploads) form.append(upload.id, upload.blob, upload.name);
    return request("/assignments/" + id + "/submissions", { method: "POST", form });
  },
  material: (workId, taskId) => request("/materials", { method: "POST", json: { workId, taskId } }),
  materials: (workId) => request("/materials?work_id=" + encodeURIComponent(workId)),
  saveMaterial: (id, data) => request("/materials/" + id, { method: "PUT", json: data }),
};
