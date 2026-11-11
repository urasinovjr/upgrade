import type { Attachment, Task, Upload, Work } from "./models";

export interface ExamPosition {
  exam: "oge" | "ege";
  level: "basic" | "profile" | null;
  year: number;
  documentVersion: string;
  position: number;
}
export interface HomeworkTask {
  id: string;
  title: string;
  condition: string;
  formula: string;
  topicId: string;
  taskTypeId: string;
  conditionFileIds: string[];
  exam?: ExamPosition | null;
  examSuggestions?: ExamPosition[];
  confirmed: boolean;
}
export type HomeworkFile = Pick<
  Attachment,
  "id" | "name" | "type" | "pages" | "masks" | "checkedPages"
>;
export interface Homework {
  id: string;
  title: string;
  revision: number;
  tasks: HomeworkTask[];
  assignedAt: string | null;
  deadline: string | null;
  createdAt: string;
  files: HomeworkFile[];
  assignments: { id: string; studentId: string }[];
  sourceText?: string;
  recognitionJobId?: string | null;
}
export interface HomeworkSave {
  title: string;
  tasks: HomeworkTask[];
  baseRevision: number;
  sourceText?: string;
}
export interface Material {
  explanation: string;
  exercises: { condition: string; answer: string; solution: string }[];
}
export interface HomeworkJob {
  id: string;
  kind: "condition_recognition" | "remediation";
  status: "queued" | "ready" | "failed" | "stale" | "needs_input";
  revision: number;
  result: { tasks: HomeworkTask[] } | Material | null;
  provenance: Record<string, unknown>;
}
export interface Submission {
  id: string;
  taskFiles: Record<string, string[]>;
}
export interface HomeworkGateway {
  list(): Promise<Homework[]>;
  save(id: string, data: HomeworkSave): Promise<Homework>;
  assign(
    id: string,
    studentIds: string[],
    deadline: string | null,
    revision: number,
  ): Promise<Homework>;
  deadline(id: string, deadline: string | null): Promise<Homework>;
  copy(id: string): Promise<Homework>;
  upload(id: string, file: File): Promise<Homework>;
  layout(id: string, file: HomeworkFile): Promise<Homework>;
  asset(id: string): Promise<Blob>;
  recognize(id: string, text: string, fileIds: string[], revision: number): Promise<HomeworkJob>;
  job(id: string): Promise<HomeworkJob>;
  invite(studentId: string): Promise<{ login: string; url: string }>;
  submit(assignmentId: string, submission: Submission, uploads: Upload[]): Promise<Work>;
  material(workId: string, taskId: string): Promise<HomeworkJob>;
  materials(workId: string): Promise<HomeworkJob[]>;
  saveMaterial(id: string, data: Material): Promise<HomeworkJob>;
}
export interface StudentSession {
  id: string;
  name: string;
  grade: number;
  login: string;
  csrfToken: string;
  writable: boolean;
}
export interface PublishedTask extends Pick<
  Task,
  "id" | "title" | "condition" | "formula" | "steps" | "feedback" | "result"
> {
  gap: { topicId: string; reason: string } | null;
}
export interface StudentState {
  assignments: {
    id: string;
    title: string;
    tasks: HomeworkTask[];
    files?: HomeworkFile[];
    deadline: string | null;
  }[];
  submissions: {
    id: string;
    assignmentId: string | null;
    title: string;
    late: boolean;
    submittedAt: string;
    status: "published" | "submitted";
    attemptNumber: number;
    result: { tasks: PublishedTask[]; feedback: string } | null;
  }[];
  knowledge: { topicId: string; reason: string; closed?: boolean }[];
}

export function newHomeworkTask(): HomeworkTask {
  return {
    id: crypto.randomUUID(),
    title: "Новое задание",
    condition: "",
    formula: "",
    topicId: "",
    taskTypeId: "",
    conditionFileIds: [],
    confirmed: false,
  };
}
export function taskResult(task: Task) {
  if (task.result) return task.result;
  if (task.omitted || !task.steps.length || task.steps.some((step) => step.verdict === "uncertain"))
    return "needs_clarification";
  return task.steps.some((step) => step.verdict === "error") ? "errors" : "solved";
}
export const resultLabels = {
  solved: "Решено",
  errors: "Есть ошибки",
  needs_clarification: "Нужно уточнить",
};
