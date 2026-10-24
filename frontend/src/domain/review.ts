import type { Draft, Report, StoreState, StudentGap, Task, Work } from "./models";

export function currentRevision(work: Work) {
  return work.published.find((revision) => revision.id === work.currentPublishedId);
}

export function inputSignature(draft: Draft): string {
  return JSON.stringify(
    draft.tasks.map((task) => ({
      id: task.id,
      condition: task.condition,
      conditionAttachmentIds: task.conditionAttachmentIds,
      conditionRegion: task.conditionRegion,
      formula: task.formula,
      reference: task.reference,
      steps: task.steps.map((step) => ({ id: step.id, latex: step.latex })),
    })),
  );
}

export function applyDraft(work: Work, proposed: Draft): Work {
  if (!work.editing) throw new Error("Начните новую версию разбора.");
  if (work.job) throw new Error("ИИ ещё разбирает работу.");
  const changedInputs = inputSignature(work.draft) !== inputSignature(proposed);
  const draft = structuredClone(proposed);
  draft.revision = work.draft.revision + 1;
  draft.inputRevision = work.draft.inputRevision + (changedInputs ? 1 : 0);
  draft.analysedInputRevision = work.draft.analysedInputRevision;
  if (changedInputs) {
    draft.tasks = draft.tasks.map((task) => {
      const before = work.draft.tasks.find((item) => item.id === task.id);
      const changed =
        !before ||
        inputSignature({ ...draft, tasks: [before] }) !==
          inputSignature({ ...draft, tasks: [task] });
      return changed ? { ...task, reviewed: false } : task;
    });
  }
  return { ...work, draft };
}

export const unreviewedBlocker = ": отметьте задачу проверенной.";

export function reviewBlockers(work: Work): string[] {
  if (!work.editing) return [];
  if (work.job) return ["ИИ ещё разбирает работу."];
  const blockers: string[] = [];
  if (work.status !== "ready")
    blockers.push("Дождитесь разбора или сверьте работу с оригиналом вручную.");
  if (work.draft.inputRevision !== work.draft.analysedInputRevision)
    blockers.push("Условия или шаги изменились. Запустите разбор заново.");
  if (!work.draft.tasks.length) blockers.push("Добавьте хотя бы одну задачу.");
  for (const task of work.draft.tasks) {
    if (task.omitted) {
      if (!task.feedback.trim()) blockers.push(task.title + ": напишите, почему задача отложена.");
      continue;
    }
    const known = (id: string) => work.attachments.some((file) => file.id === id);
    const regionFile = task.conditionRegion?.fileId;
    if (
      !task.condition.trim() &&
      !task.formula.trim() &&
      !task.conditionAttachmentIds?.some(known) &&
      !(regionFile && known(regionFile))
    )
      blockers.push(task.title + ": добавьте условие.");
    if (!task.steps.length || task.steps.some((step) => !step.latex.trim()))
      blockers.push(task.title + ": добавьте шаги решения.");
    if (task.steps.some((step) => step.verdict === "uncertain"))
      blockers.push(task.title + ": уточните неясные шаги.");
    if (task.steps.some((step) => step.verdict === "error" && !step.explanation.trim()))
      blockers.push(task.title + ": объясните ошибку.");
    if (task.gap?.decision === "confirmed" && !task.gap.reason.trim())
      blockers.push(task.title + ": напишите, что повторить.");
    if (!task.reviewed) blockers.push(task.title + unreviewedBlocker);
  }
  return blockers;
}

export function publishWork(work: Work, now = new Date().toISOString()): Work {
  if (!work.editing && currentRevision(work)) return work;
  const blockers = reviewBlockers(work);
  if (blockers.length) throw new Error(blockers[0]);
  const revision = {
    id: crypto.randomUUID(),
    number: work.published.length + 1,
    confirmedAt: now,
    draft: structuredClone(work.draft),
    attachments: structuredClone(work.attachments),
  };
  return {
    ...work,
    status: "confirmed",
    editing: false,
    currentPublishedId: revision.id,
    published: [...work.published, revision],
  };
}

export function beginRevision(work: Work): Work {
  const published = currentRevision(work);
  if (!published) return { ...work, editing: true };
  if (work.editing) return work;
  return {
    ...work,
    editing: true,
    status: "ready",
    draft: {
      ...structuredClone(published.draft),
      revision: work.draft.revision + 1,
      tasks: published.draft.tasks.map((task) => ({ ...structuredClone(task), reviewed: false })),
    },
  };
}

export function finishJob(work: Work, token: string, now: number): Work {
  const job = work.job;
  if (!job || job.token !== token || now < job.completesAt) return work;
  const rest = { ...work };
  delete rest.job;
  if (job.inputRevision !== work.draft.inputRevision) return { ...rest, status: "needs_input" };
  return {
    ...rest,
    status: job.outcome,
    draft:
      job.outcome === "ready"
        ? { ...work.draft, analysedInputRevision: job.inputRevision }
        : work.draft,
  };
}

export function deriveGaps(state: StoreState, studentId: string): StudentGap[] {
  const gaps = new Map<string, StudentGap>();
  for (const work of state.works.filter((item) => item.studentId === studentId)) {
    const revision = currentRevision(work);
    if (!revision) continue;
    for (const task of revision.draft.tasks) {
      if (task.omitted || task.gap?.decision !== "confirmed") continue;
      const gap = gaps.get(task.gap.topicId) ?? {
        topicId: task.gap.topicId,
        reason: task.gap.reason,
        evidence: [],
        closed: false,
      };
      gap.evidence.push({
        workId: work.id,
        taskId: task.id,
        title: work.title,
        revisionId: revision.id,
      });
      gaps.set(gap.topicId, gap);
    }
  }
  for (const gap of gaps.values()) {
    const closure = [...state.closures]
      .reverse()
      .find((item) => item.studentId === studentId && item.topicId === gap.topicId);
    gap.closed = closure?.action === "close";
    gap.closure = closure;
  }
  return [...gaps.values()];
}

export function reportText(report: Report): string {
  const { student, work, revision } = report;
  const lines = [
    "UpGrade · Отчёт по работе",
    student.name + " · " + student.grade + " класс",
    work.title,
    "Версия " + revision.number,
    "",
  ];
  for (const task of revision.draft.tasks) {
    lines.push(task.title, task.condition, task.formula);
    const conditionFiles = revision.attachments.filter((file) =>
      task.conditionAttachmentIds?.includes(file.id),
    );
    if (conditionFiles.length)
      lines.push("Условие в PDF-отчёте: " + conditionFiles.map((file) => file.name).join(", "));
    if (task.omitted) {
      lines.push("Разберём отдельно. " + (task.feedback || "Решение посмотрим вместе на занятии."));
    } else {
      task.steps.forEach((step, index) =>
        lines.push("Шаг " + (index + 1) + ": " + step.latex, step.explanation),
      );
      if (task.feedback) lines.push("Комментарий: " + task.feedback);
      if (task.gap?.decision === "confirmed") lines.push("Что повторить: " + task.gap.reason);
    }
    lines.push("");
  }
  if (revision.draft.feedback) lines.push("Что дальше: " + revision.draft.feedback);
  return lines.filter((line, index, all) => line || all[index - 1]).join("\n");
}

export function blankTask(index: number): Task {
  return {
    id: crypto.randomUUID(),
    title: "Задача " + index,
    condition: "",
    formula: "",
    reference: "",
    topicId: "equations",
    steps: [{ id: crypto.randomUUID(), latex: "", verdict: "uncertain", explanation: "" }],
    feedback: "",
    reviewed: false,
    omitted: false,
  };
}
