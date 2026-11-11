import type { StudentSession, StudentState, Submission } from "../domain/homework";
import type { Upload } from "../domain/models";
import { currentRevision, deriveGaps } from "../domain/review";
import { taskResult } from "../domain/homework";
import { request, requestBlob, setCsrfToken } from "./api";
import { gateway, serverMode } from "./gateway";

export const studentGateway = {
  async session(demoId?: string | null): Promise<StudentSession | null> {
    if (!serverMode) {
      const student = (await gateway.read()).students.find((student) => student.id === demoId);
      return student ? { ...student, login: "Демонстрация", csrfToken: "", writable: true } : null;
    }
    try {
      const session = await request<StudentSession>("/student/session");
      setCsrfToken(session.csrfToken);
      return session;
    } catch (error) {
      if (error instanceof Error && "status" in error && [401, 403].includes(Number(error.status)))
        return null;
      throw error;
    }
  },
  async login(login: string, password: string) {
    const result = await request<{ login: string; csrfToken: string }>("/student/login", {
      method: "POST",
      json: { login, password },
    });
    setCsrfToken(result.csrfToken);
    return result;
  },
  async activate(token: string, password: string) {
    const result = await request<{ login: string; csrfToken: string }>("/student/activate", {
      method: "POST",
      json: { token, password },
    });
    setCsrfToken(result.csrfToken);
    return result;
  },
  logout: () => request("/student/logout", { method: "POST" }),
  async state(studentId: string): Promise<StudentState> {
    if (serverMode) return request("/student/state");
    const state = await gateway.read();
    const homeworks = await gateway.homework.list();
    const works = state.works
      .filter((work) => work.studentId === studentId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const attempts = new Map<string, number>();
    return {
      assignments: homeworks.flatMap((homework) =>
        homework.assignments
          .filter((item) => item.studentId === studentId)
          .map((item) => ({
            id: item.id,
            title: homework.title,
            tasks: homework.tasks,
            deadline: homework.deadline,
            files: homework.files.filter((file) =>
              homework.tasks.some((task) => task.conditionFileIds.includes(file.id)),
            ),
          })),
      ),
      submissions: works
        .map((work): StudentState["submissions"][number] => {
          const revision = currentRevision(work);
          const group = work.assignmentId ?? work.id;
          const attemptNumber = (attempts.get(group) ?? 0) + 1;
          attempts.set(group, attemptNumber);
          return {
            id: work.id,
            assignmentId: work.assignmentId ?? null,
            title: work.title,
            attemptNumber,
            late: work.late ?? false,
            submittedAt: work.submittedAt ?? work.createdAt,
            status: revision ? "published" : "submitted",
            result: revision
              ? {
                  feedback: revision.draft.feedback,
                  tasks: revision.draft.tasks.map((task) => ({
                    id: task.id,
                    title: task.title,
                    condition: task.condition,
                    formula: task.formula,
                    steps: task.steps.map(({ id, latex, verdict, explanation }) => ({
                      id,
                      latex,
                      verdict,
                      explanation,
                    })),
                    feedback: task.feedback,
                    result: taskResult(task),
                    gap:
                      task.gap?.decision === "confirmed"
                        ? { topicId: task.gap.topicId, reason: task.gap.reason }
                        : null,
                  })),
                }
              : null,
          };
        })
        .reverse(),
      knowledge: deriveGaps(state, studentId).map((gap) => ({
        topicId: gap.topicId,
        reason: gap.reason,
        closed: gap.closed,
      })),
    };
  },
  async submit(assignmentId: string, submission: Submission, uploads: Upload[]) {
    if (!serverMode) return gateway.homework.submit(assignmentId, submission, uploads);
    const form = new FormData();
    form.append("meta", JSON.stringify(submission));
    for (const upload of uploads) form.append(upload.id, upload.blob, upload.name);
    return request<{ id: string }>("/student/assignments/" + assignmentId + "/submissions", {
      method: "POST",
      form,
    });
  },
  asset: (id: string) =>
    serverMode ? requestBlob("/student/files/" + id) : gateway.homework.asset(id),
};
