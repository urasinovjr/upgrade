import {
  AlertCircle,
  ArrowRight,
  CheckCheck,
  Crosshair,
  PauseCircle,
  Pencil,
  PencilLine,
  Plus,
} from "lucide-react";
import { Link } from "react-router";
import { serverMode } from "../../data/gateway";
import { resultLabels, taskResult } from "../../domain/homework";
import type { Task } from "../../domain/models";
import { Formula, MixedText } from "../../shared/math";
import { MediaViewer } from "../../shared/MediaViewer";
import { Callout, Disclosure } from "../../shared/ui";
import "../homework/homework.css";
import { Materials } from "../homework/Materials";
import { InitialAnalysis } from "./InitialAnalysis";
import "./review.css";
import { GapSection } from "./ReviewPresentation";
import {} from "./reviewView";
import { SentPages } from "./SentPages";
import { StepItem } from "./StepItem";
import type { ReviewController } from "./useReviewController";
export function ReviewBody({ context }: { context: ReviewController }) {
  const {
    work,
    draft,
    change,
    busy,
    blockers,
    setEditor,
    setConditionEdit,
    materialsOpen,
    setMaterialsOpen,
    setGapEdit,
    task,
    editable,
    updateTask,
    saveStep,
    markReviewed,
    showCondition,
    showOrigin,
    conditionFiles,
    taskBlockers,
    taskHint,
    initial,
  } = context;
  const body = task ? (
    <>
      {task.qualityWarnings && task.qualityWarnings.length > 0 && (
        <Callout
          tone="warning"
          icon={<AlertCircle size={16} aria-hidden="true" />}
          title="Нужна сверка"
        >
          <ul>
            {task.qualityWarnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </Callout>
      )}
      <div className="hw-task-result">
        {editable ? (
          <label>
            Результат задания
            <select
              value={task.result ?? "auto"}
              disabled={busy}
              onChange={(event) =>
                updateTask({
                  result:
                    event.target.value === "auto"
                      ? undefined
                      : (event.target.value as NonNullable<Task["result"]>),
                  reviewed: false,
                })
              }
            >
              <option value="auto">По проверенным шагам</option>
              {Object.entries(resultLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p>{resultLabels[taskResult(task)]}</p>
        )}
        {work.late && <p className="dp-caption">Сдано с опозданием</p>}
      </div>
      <div className="dp-task-condition">
        <div className="dp-task-condition-head">
          <h2>
            <MixedText value={task.condition || "Условие не указано"} />
          </h2>
          {editable && !work.assignmentId && (
            <button
              className="dp-text dp-condition-edit"
              disabled={busy}
              aria-label={"Изменить условие: " + task.title}
              onClick={() => setConditionEdit(true)}
            >
              <Pencil size={14} />
              <span>Изменить</span>
            </button>
          )}
        </div>
        {task.formula.trim() && (
          <div className="dp-condition">
            <Formula value={task.formula} />
          </div>
        )}
        {task.conditionRegion && (
          <button className="dp-text" onClick={() => showCondition(task)}>
            <Crosshair size={14} aria-hidden="true" />
            Показать условие на странице
          </button>
        )}
        {conditionFiles.length > 0 && (
          <Disclosure title="Условие во вложении">
            <MediaViewer files={conditionFiles} />
          </Disclosure>
        )}
      </div>
      {task.omitted ? (
        <section className="dp-omitted">
          <h3>
            <PauseCircle size={14} aria-hidden="true" />
            Задача отложена для отдельной проверки
          </h3>
          {editable ? (
            <label>
              Почему задача отложена
              <textarea
                value={task.feedback}
                disabled={busy}
                placeholder="Например, часть решения не видна на фото"
                onChange={(event) => updateTask({ feedback: event.target.value })}
              />
            </label>
          ) : (
            <p>{task.feedback || "Причина не указана"}</p>
          )}
          {editable && (
            <button
              className="dp-text"
              disabled={busy}
              onClick={() => updateTask({ omitted: false, reviewed: false })}
            >
              Вернуть в разбор
            </button>
          )}
        </section>
      ) : (
        <>
          <div className="dp-step-list">
            {task.steps.map((item, index) => (
              <StepItem
                key={item.id}
                step={item}
                index={index + 1}
                editable={editable}
                disabled={busy}
                onVerdict={(verdict) => {
                  const sameKind = (verdict === "correct") === (item.verdict === "correct");
                  const explanation = sameKind ? item.explanation : "";
                  const dropsExplanation = !sameKind && Boolean(item.explanation.trim());
                  const missingErrorExplanation = verdict === "error" && !explanation.trim();
                  if (dropsExplanation || missingErrorExplanation)
                    setEditor({ id: item.id, explain: true, preset: { verdict, explanation } });
                  else saveStep({ ...item, verdict, explanation });
                }}
                onEdit={() => setEditor({ id: item.id })}
                onShow={() => showOrigin(item)}
                onUnlink={() =>
                  updateTask({
                    steps: task.steps.map((step) =>
                      step.id === item.id ? { ...step, origin: undefined } : step,
                    ),
                  })
                }
              />
            ))}
            {editable && (
              <button
                className="dp-text dp-add-step"
                disabled={busy}
                onClick={() => {
                  const id = crypto.randomUUID();
                  updateTask({
                    steps: [
                      ...task.steps,
                      { id, latex: "", verdict: "uncertain", explanation: "" },
                    ],
                    reviewed: false,
                  });
                  setEditor({ id });
                }}
              >
                <Plus size={14} />
                Добавить шаг
              </button>
            )}
          </div>
          {task.gap ? (
            <GapSection
              gap={task.gap}
              editable={editable}
              busy={busy}
              onChange={(gap) => updateTask({ gap, reviewed: false })}
              onEdit={() => setGapEdit(true)}
            />
          ) : (
            editable && (
              <button
                className="dp-text dp-gap-add"
                disabled={busy}
                onClick={() => {
                  updateTask({
                    gap: { topicId: task.topicId, reason: "", decision: "hypothesis" },
                    reviewed: false,
                  });
                  setGapEdit(true);
                }}
              >
                <PencilLine size={14} />
                Добавить гипотезу
              </button>
            )
          )}
          {!task.gap && task.gapReason && (
            <p className="dp-caption">
              <MixedText value={task.gapReason} />
            </p>
          )}
          <section className="dp-feedback">
            {editable ? (
              <label className="review-feedback">
                Комментарий для ученика
                <textarea
                  value={task.feedback}
                  disabled={busy}
                  placeholder="Коротко: что получилось и что повторить"
                  onChange={(event) =>
                    updateTask({ feedback: event.target.value, reviewed: false })
                  }
                />
              </label>
            ) : (
              <>
                <h3>Комментарий для ученика</h3>
                <p className={task.feedback ? undefined : "dp-feedback-empty"}>
                  <MixedText value={task.feedback || "Комментария нет"} />
                </p>
              </>
            )}
          </section>
        </>
      )}
      {editable && (
        <div className="dp-task-footer">
          {(!task.omitted || task.result === "needs_clarification") && (
            <>
              <button
                className={"dp-task-complete" + (task.reviewed ? " is-checked" : "")}
                disabled={busy || (!task.reviewed && taskBlockers.length > 0)}
                onClick={markReviewed}
              >
                <CheckCheck size={16} />
                {task.reviewed ? "Задача проверена" : "Отметить проверенной"}
              </button>
              {taskHint && <span className="dp-caption">{taskHint}</span>}
              <button
                className="dp-text dp-task-omit"
                disabled={busy}
                title="Отложить задачу для отдельной проверки"
                onClick={() => updateTask({ omitted: true, reviewed: false })}
              >
                <PauseCircle size={14} />
                Отложить задачу
              </button>
            </>
          )}
        </div>
      )}
      <section className="dp-work-comment">
        {editable ? (
          <label>
            Что дальше
            <textarea
              value={draft.feedback}
              disabled={busy}
              placeholder="Итог по всей работе, в отчёте идёт после задач"
              onChange={(event) => change({ ...draft, feedback: event.target.value })}
            />
          </label>
        ) : (
          <>
            <h3>Что дальше</h3>
            <p>{draft.feedback || "Комментария нет"}</p>
          </>
        )}
      </section>
      <div className="dp-review-extras">
        {work.currentPublishedId && (
          <details onToggle={(event) => setMaterialsOpen(event.currentTarget.open)}>
            <summary>Отработка</summary>
            {materialsOpen && <Materials work={work} />}
          </details>
        )}
        {work.editing && blockers.length > 0 && (
          <Disclosure title={"Что осталось проверить · " + blockers.length}>
            <ul className="dp-readiness">
              {blockers.map((reason, index) => (
                <li key={index}>{reason}</li>
              ))}
            </ul>
          </Disclosure>
        )}
        <Disclosure title="Правильный ответ">
          {task.reference ? <Formula value={task.reference} /> : <p>Правильный ответ не указан</p>}
        </Disclosure>
        <Disclosure title="Первый разбор ИИ">
          <InitialAnalysis task={initial} analysis={work.analysis} />
        </Disclosure>
        {serverMode && work.analysis && (
          <Disclosure title="Что получил ИИ">
            <SentPages workId={work.id} runId={work.analysis.runId} files={work.attachments} />
          </Disclosure>
        )}
        <Disclosure title={"История версий · " + work.published.length}>
          {work.published.length ? (
            work.published.map((revision) => (
              <Link
                key={revision.id}
                className="dp-revision-link"
                to={"/works/" + work.id + "/report?revision=" + revision.id}
              >
                Версия {revision.number}
                {revision.id === work.currentPublishedId ? " · текущая" : " · архивная"}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            ))
          ) : (
            <p>Версии появятся после публикации результата</p>
          )}
        </Disclosure>
      </div>
    </>
  ) : (
    <div className="dp-empty">
      <h2>Задач пока нет</h2>
      <p>Добавьте задачу, чтобы начать разбор</p>
    </div>
  );

  return body;
}
