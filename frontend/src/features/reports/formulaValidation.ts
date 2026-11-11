import { mathMarkup } from "../../shared/mathMarkup";
import { mixedTextParts } from "../../shared/mixedText";
import type { Report } from "../../domain/models";

export class ReportFormulaError extends Error {
  constructor(
    public taskId: string,
    taskTitle: string,
    public step: number | undefined,
  ) {
    super(
      `Не удалось отобразить формулу: ${taskTitle}, ${step ? "шаг " + step : "условие"}. Исправьте её в новой версии работы`,
    );
  }
}

export function validateReportFormulas(report: Report) {
  for (const task of report.revision.draft.tasks) {
    const formulas: { value: string; step: number | undefined; bareMath?: boolean }[] = [
      { value: task.formula, step: undefined },
      { value: task.condition, step: undefined, bareMath: false },
      { value: task.feedback, step: undefined, bareMath: false },
      ...(!task.omitted
        ? task.steps.flatMap((step, index) => [
            { value: step.latex, step: index + 1 },
            { value: step.explanation, step: index + 1, bareMath: false },
          ])
        : []),
    ];
    for (const { value, step, bareMath } of formulas) {
      if (!value) continue;
      if (
        mixedTextParts(value, bareMath).some(
          (part) =>
            part.kind === "invalid" || (part.kind === "math" && mathMarkup(part.value) === null),
        )
      )
        throw new ReportFormulaError(task.id, task.title, step);
    }
  }
}
