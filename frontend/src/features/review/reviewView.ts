import type { Task, Work } from "../../domain/models";
import { unreviewedBlocker } from "../../domain/review";
import { wordForCount } from "../../shared/text";
import type { SaveState } from "./useReviewDraft";
export const saveLabels: Record<SaveState, string> = {
  saving: "Сохраняем…",
  dirty: "Не сохранено",
  saved: "Сохранено",
};

export function same<T extends object>(before: T | undefined, after: T) {
  return (
    !!before && Object.entries(after).every(([key, value]) => before[key as keyof T] === value)
  );
}

export function taskIssues(task: Task) {
  return {
    errors: task.steps.filter((step) => step.verdict === "error").length,
    unclear: task.steps.filter((step) => step.verdict === "uncertain").length,
  };
}

export function taskState(task: Task) {
  const { errors, unclear } = taskIssues(task);
  return [
    errors && errors + " " + wordForCount(errors, ["ошибка", "ошибки", "ошибок"]),
    unclear &&
      unclear + " " + wordForCount(unclear, ["неясный шаг", "неясных шага", "неясных шагов"]),
    task.omitted ? "отложена" : task.reviewed ? "проверена" : "не проверена",
  ]
    .filter(Boolean)
    .join(", ");
}

export function blockerHint(work: Work, blockers: string[]) {
  const first = blockers[0];
  if (!first) return "";
  const unreviewed = work.draft.tasks.flatMap((task, index) =>
    task.reviewed || task.omitted ? [] : [index + 1],
  );
  if (first.endsWith(unreviewedBlocker) && unreviewed.length)
    return unreviewed.length > 1
      ? "Отметьте задачи " + unreviewed.join(" и ") + " проверенными"
      : "Отметьте задачу " + unreviewed[0] + " проверенной";
  return first.replace(/\.$/, "");
}

export function recheckNote(work: Work, needsRecheck: boolean) {
  if (work.status !== "needs_input" && needsRecheck) return "Работа изменилась после разбора";
  return "Завершите проверку перед публикацией";
}
