import { topicLabel as topicName } from "../../data/catalog";
import type { AnalysisInfo, Task } from "../../domain/models";
import { Formula } from "../../shared/math";
import { verdictMeta } from "../../shared/status";

function analysisSource(analysis: AnalysisInfo) {
  const finished = new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(analysis.finishedAt));
  return finished;
}

export function InitialAnalysis({ task, analysis }: { task?: Task; analysis?: AnalysisInfo }) {
  if (!task) return <p>Эту работу вы проверяете вручную, без ИИ</p>;
  return (
    <>
      {analysis && (
        <p title={analysis.model + " · " + analysis.promptVersion}>
          Разбор ИИ от {analysisSource(analysis)}
        </p>
      )}
      {task.omitted ? (
        <p>ИИ не разобрал задачу: {task.feedback}</p>
      ) : (
        task.steps.map((step) => (
          <div key={step.id}>
            <Formula value={step.latex} />
            <p>
              {verdictMeta[step.verdict].label}
              {step.explanation && ". " + step.explanation}
            </p>
          </div>
        ))
      )}
      {task.gap && (
        <p>
          Гипотеза о пробеле: {topicName(task.gap.topicId)}. {task.gap.reason}
        </p>
      )}
    </>
  );
}
