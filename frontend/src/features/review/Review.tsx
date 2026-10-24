import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import * as Tabs from "@radix-ui/react-tabs";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCheck,
  FileText,
  ListChecks,
  LoaderCircle,
  PauseCircle,
  Pencil,
  Plus,
  ShieldCheck,
  PenLine,
  PencilLine,
} from "lucide-react";
import { topics } from "../../data/fixtures";
import { serverMode } from "../../data/gateway";
import type { GapDecision, GapProposal, Step, Student, Task, Work } from "../../domain/models";
import { blankTask, currentRevision, reviewBlockers, unreviewedBlocker } from "../../domain/review";
import { needsAttention, sortQueue } from "../../domain/analytics";
import { useStore } from "../../shared/query";
import {
  Badge,
  Callout,
  Disclosure,
  Modal,
  PageBar,
  PageLoading,
  PageState,
  Panel,
} from "../../shared/ui";
import { cancelContentChange, changeContent } from "../../shared/ui/motion";
import { Formula } from "../../shared/math";
import { MediaViewer } from "../../shared/MediaViewer";
import { errorText, wordForCount } from "../../shared/text";
import { usePinnedActions } from "../../shared/layout";
import { useReviewDraft, type SaveState } from "./useReviewDraft";
import { DeleteWork } from "./DeleteWork";
import { InitialAnalysis } from "./InitialAnalysis";
import { SentPages } from "./SentPages";
import { useActiveTime } from "../timing/useActiveTime";
import { Reanalyse } from "./Reanalyse";
import { uncheckedPages } from "../../domain/redaction";
import { namePlaceLabels, namePlaces } from "../../domain/nameGuard";
import type { OriginFocus } from "../../domain/stepOrigin";
import { StepEditor, StepItem } from "./StepItem";
import { ConditionEditor, GapEditor } from "./TaskEditors";
import { useMediaQuery } from "../../shared/useMediaQuery";
import "./review.css";

const narrowQuery = "(max-width: 1199px)";

const saveLabels: Record<SaveState, string> = {
  saving: "Сохраняем…",
  dirty: "Не сохранено",
  saved: "Сохранено",
};

function same<T extends object>(before: T | undefined, after: T) {
  return (
    !!before && Object.entries(after).every(([key, value]) => before[key as keyof T] === value)
  );
}

function taskIssues(task: Task) {
  return {
    errors: task.steps.filter((step) => step.verdict === "error").length,
    unclear: task.steps.filter((step) => step.verdict === "uncertain").length,
  };
}

function taskState(task: Task) {
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

function blockerHint(work: Work, blockers: string[]) {
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

function recheckNote(work: Work, needsRecheck: boolean) {
  if (work.status !== "needs_input" && needsRecheck) return "Работа изменилась после разбора.";
  return "Без этого работу не подтвердить.";
}

function TaskLabel({ task }: { task: Task }) {
  const { errors, unclear } = taskIssues(task);
  const done = task.reviewed || task.omitted;
  const count = errors || unclear;
  const countTone = errors ? "danger" : "warning";
  return (
    <>
      <span className={"dp-task-state" + (done ? " is-reviewed" : "")} aria-hidden="true">
        {task.omitted ? <PauseCircle size={12} /> : task.reviewed && <Check size={12} />}
      </span>
      {task.title}
      {count > 0 && (
        <span className={"dp-task-count dp-tone-" + countTone} aria-hidden="true">
          {count}
        </span>
      )}
    </>
  );
}

function TaskTab({ task }: { task: Task }) {
  const describe = useId();
  return (
    <>
      <Tabs.Trigger value={task.id} aria-describedby={describe}>
        <TaskLabel task={task} />
      </Tabs.Trigger>
      <span id={describe} className="dp-visually-hidden">
        {taskState(task)}
      </span>
    </>
  );
}

const gapNotes: Record<GapDecision, { editable: string; readOnly: string }> = {
  confirmed: {
    editable: "Пробел попадёт в карту знаний, когда вы подтвердите работу.",
    readOnly: "Подтверждено вами",
  },
  rejected: {
    editable: "Гипотеза останется в истории и не попадёт в карту знаний.",
    readOnly: "Гипотеза отклонена",
  },
  hypothesis: {
    editable: "Пока вы не решите, гипотеза не попадает в карту знаний.",
    readOnly: "Гипотеза не попала в карту знаний",
  },
};

function GapSection({
  gap,
  editable,
  busy,
  onChange,
  onEdit,
}: {
  gap: GapProposal;
  editable: boolean;
  busy: boolean;
  onChange: (gap: GapProposal) => void;
  onEdit: () => void;
}) {
  const topic = topics.find((item) => item.id === gap.topicId);
  const toggle = (decision: "confirmed" | "rejected") =>
    onChange({ ...gap, decision: gap.decision === decision ? "hypothesis" : decision });
  return (
    <section className="dp-gap-proposal" data-decision={gap.decision}>
      <h3>
        {gap.decision === "confirmed" ? (
          <PenLine size={14} aria-hidden="true" />
        ) : (
          <PencilLine size={14} aria-hidden="true" />
        )}
        {gap.decision === "confirmed" ? "Пробел" : "Гипотеза о пробеле"} ·{" "}
        {topic?.name ?? "Тема не найдена"}
      </h3>
      <p className={gap.reason.trim() ? undefined : "dp-gap-empty"}>
        {gap.reason.trim() || "Укажите, что повторить."}
      </p>
      {editable ? (
        <>
          <div className="dp-inline-actions">
            <button
              className="dp-gap-confirm"
              aria-pressed={gap.decision === "confirmed"}
              disabled={busy}
              onClick={() => toggle("confirmed")}
            >
              <Check size={14} />
              {gap.decision === "confirmed" ? "Пробел подтверждён" : "Подтвердить пробел"}
            </button>
            <button
              className="dp-text"
              aria-pressed={gap.decision === "rejected"}
              disabled={busy}
              onClick={() => toggle("rejected")}
            >
              {gap.decision === "rejected" ? "Гипотеза отклонена" : "Отклонить"}
            </button>
            <button
              className="dp-text dp-gap-edit"
              disabled={busy}
              aria-label="Изменить гипотезу о пробеле"
              onClick={onEdit}
            >
              <Pencil size={14} />
              <span>Изменить</span>
            </button>
          </div>
          <span className="dp-caption">{gapNotes[gap.decision].editable}</span>
        </>
      ) : (
        <span className="dp-caption">{gapNotes[gap.decision].readOnly}</span>
      )}
    </section>
  );
}

type Pane = "analysis" | "original";
const panes: { value: Pane; label: string; Icon: typeof FileText }[] = [
  { value: "analysis", label: "Разбор", Icon: ListChecks },
  { value: "original", label: "Оригинал", Icon: FileText },
];
function PaneSwitch({
  pane,
  controls,
  onChange,
}: {
  pane: Pane;
  controls: Record<Pane, string>;
  onChange: (pane: Pane) => void;
}) {
  const move = (event: KeyboardEvent) => {
    const other: Pane = pane === "analysis" ? "original" : "analysis";
    const keys: Record<string, Pane | undefined> = {
      ArrowLeft: other,
      ArrowRight: other,
      Home: "analysis",
      End: "original",
    };
    const target = keys[event.key];
    if (!target) return;
    event.preventDefault();
    onChange(target);
  };
  return (
    <div className="dp-mobile-panes dp-segmented" role="tablist" aria-label="Разбор работы">
      {panes.map(({ value, label, Icon }) => (
        <button
          key={value}
          role="tab"
          aria-selected={pane === value}
          aria-controls={controls[value]}
          tabIndex={pane === value ? 0 : -1}
          onKeyDown={move}
          onClick={() => onChange(value)}
        >
          <Icon size={16} aria-hidden="true" />
          <span className="dp-pane-label">{label}</span>
        </button>
      ))}
    </div>
  );
}

export default function Review() {
  const { id } = useParams();
  const query = useStore();
  if (query.isPending) return <PageLoading variant="review" />;
  if (!query.data)
    return (
      <PageState title="Разбор работы" error={query.error} retry={() => void query.refetch()} />
    );
  const work = query.data.works.find((item) => item.id === id);
  if (!work)
    return (
      <PageState
        title="Работа не найдена"
        description="Проверьте ссылку или выберите работу из списка."
        to="/works"
        linkLabel="К работам"
      />
    );
  const student = query.data.students.find((item) => item.id === work.studentId)!;
  return (
    <ReviewEditor
      key={work.id + "-" + work.editing}
      work={work}
      student={student}
      works={query.data.works}
    />
  );
}

function ReviewEditor({ work, student, works }: { work: Work; student: Student; works: Work[] }) {
  const review = useReviewDraft(work);
  const { draft, change, canEdit, busy, needsRecheck, blockers, action } = review;
  useActiveTime("review", work.id);
  const navigate = useNavigate();
  const narrow = useMediaQuery(narrowQuery);
  const pinnedActions = usePinnedActions();
  const [params, setParams] = useSearchParams();
  const requested = params.get("task");
  const [taskId, setTaskId] = useState(() => {
    if (draft.tasks.some((task) => task.id === requested)) return requested!;
    const attention = draft.tasks.find((task) => {
      const { errors, unclear } = taskIssues(task);
      return errors + unclear > 0;
    });
    return (attention ?? draft.tasks[0])?.id ?? "";
  });
  const [lastRequested, setLastRequested] = useState(requested);
  if (requested !== lastRequested) {
    setLastRequested(requested);
    if (requested && draft.tasks.some((task) => task.id === requested)) setTaskId(requested);
  }
  const [pane, setPane] = useState<Pane>("analysis");
  const [focus, setFocus] = useState<OriginFocus>();
  const [editor, setEditor] = useState<{
    id: string;
    explain?: boolean;
    preset?: Partial<Step>;
  } | null>(null);
  const [conditionEdit, setConditionEdit] = useState(false);
  const [gapEdit, setGapEdit] = useState(false);
  const [withdraw, setWithdraw] = useState(false);
  const [removeTask, setRemoveTask] = useState(false);
  const analysis = useRef<HTMLDivElement>(null);
  const focusTab = useRef(false);
  const ids = { original: useId(), analysis: useId(), reason: useId() };
  const shownTask = useRef(taskId);
  useEffect(() => {
    if (shownTask.current === taskId) return;
    shownTask.current = taskId;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (taskId) next.set("task", taskId);
        else next.delete("task");
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [taskId, setParams]);
  useEffect(() => {
    if (!focusTab.current) return;
    focusTab.current = false;
    document
      .querySelector<HTMLElement>(".dp-task-tabs [aria-selected=true]")
      ?.focus({ preventScroll: true });
  }, [taskId]);

  const tasks = draft.tasks;
  const task = tasks.find((item) => item.id === taskId) ?? tasks[0];
  const editable = work.editing && !work.job;
  const published = currentRevision(work);
  const queue = sortQueue(works.filter(needsAttention));
  const position = queue.findIndex((item) => item.id === work.id);
  const nextWork = [...queue.slice(position + 1), ...queue.slice(0, Math.max(0, position))].find(
    (item) => item.id !== work.id,
  );
  const checked = tasks.filter((item) => item.reviewed || item.omitted).length;
  const workHint = blockerHint(review.effective, blockers);
  const step = task?.steps.find((item) => item.id === editor?.id);
  const pages = work.attachments.reduce((sum, file) => sum + file.pages, 0);
  const stale = needsRecheck || work.status !== "ready";

  const updateTask = (patch: Partial<Task>) =>
    change({
      ...draft,
      tasks: tasks.map((item) => (item.id === task?.id ? { ...item, ...patch } : item)),
    });
  const saveStep = (value: Step) =>
    task &&
    !same(
      task.steps.find((item) => item.id === value.id),
      value,
    ) &&
    updateTask({
      steps: task.steps.map((item) => (item.id === value.id ? value : item)),
      reviewed: false,
    });
  const selectTask = (id: string) => {
    if (id === task?.id) cancelContentChange(analysis.current);
    else void changeContent(analysis.current, () => setTaskId(id));
  };
  const markReviewed = () => {
    if (!task) return;
    if (task.reviewed) {
      updateTask({ reviewed: false });
      return;
    }
    updateTask({ reviewed: true });
    const index = tasks.indexOf(task);
    const next = tasks
      .map((_, offset) => tasks[(index + 1 + offset) % tasks.length])
      .find((item) => item.id !== task.id && !item.reviewed && !item.omitted);
    if (!next) return;
    focusTab.current = true;
    selectTask(next.id);
  };
  const addTask = () => {
    const next = blankTask(tasks.length + 1);
    change({ ...draft, tasks: [...tasks, next] });
    setTaskId(next.id);
    setConditionEdit(true);
  };
  const changePane = (next: Pane) => {
    setPane(next);
    requestAnimationFrame(() =>
      [...document.querySelectorAll<HTMLElement>(".dp-mobile-panes [aria-selected=true]")]
        .find((button) => button.getClientRects().length)
        ?.focus({ preventScroll: true }),
    );
  };
  const showOrigin = (step: Step) => {
    const origin = step.origin;
    if (!origin) return;
    setFocus((current) => ({ ...origin, nonce: (current?.nonce ?? 0) + 1 }));
    if (narrow) changePane("original");
  };
  const paneSwitch = (
    <PaneSwitch
      pane={pane}
      controls={{ original: ids.original, analysis: ids.analysis }}
      onChange={changePane}
    />
  );
  const nextButton = (primary: boolean) =>
    nextWork && (
      <button
        className={"dp-next-work" + (primary ? " dp-primary" : "")}
        onClick={() => navigate("/works/" + nextWork.id)}
        title={"Следующая работа: " + nextWork.title}
      >
        <span className="dp-next-label">Следующая работа</span>
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    );
  const reportLink = published && (
    <Link
      className="dp-button"
      to={"/works/" + work.id + "/report"}
      aria-label={"Отчёт, версия " + published.number}
    >
      <FileText size={14} aria-hidden="true" />
      Отчёт
    </Link>
  );
  const reanalyse = (work.demo || serverMode) && (
    <Reanalyse
      work={work}
      busy={busy}
      unchecked={uncheckedPages(work.attachments).length}
      nameIssues={namePlaceLabels(namePlaces(student.name, draft.tasks), draft.tasks)}
      run={() => void action("analyse")}
    />
  );
  const finishSync = (
    <button disabled={busy} onClick={() => void action("manual")}>
      Всё сверено
      <Check size={14} aria-hidden="true" />
    </button>
  );
  const error = review.error;

  const original = (
    <section
      id={ids.original}
      className="dp-original"
      aria-label="Оригинал решения"
      role={narrow ? "tabpanel" : undefined}
    >
      <MediaViewer
        files={work.attachments}
        update={canEdit ? review.updateAttachments : undefined}
        redaction={work.editing}
        focus={focus}
        lead={
          <>
            {paneSwitch}
            <span className="dp-original-title">
              <FileText size={16} aria-hidden="true" />
              Оригинал
            </span>
            <span className="dp-original-pages">{pages} стр.</span>
          </>
        }
      />
    </section>
  );

  const conditionFiles = task
    ? work.attachments.filter((file) => task.conditionAttachmentIds?.includes(file.id))
    : [];
  const taskBlockers = task
    ? reviewBlockers({
        ...review.effective,
        draft: { ...review.effective.draft, tasks: [{ ...task, reviewed: true }] },
      })
    : [];
  const taskHint =
    taskBlockers[0] && taskBlockers[0].replace(/\.$/, "") !== workHint ? taskBlockers[0] : "";
  const initial = work.initialAnalysis?.tasks.find((item) => item.id === task?.id);

  const body = task ? (
    <>
      <div className="dp-task-condition">
        <div className="dp-task-condition-head">
          <h2>{task.condition || "Условие не указано"}</h2>
          {editable && (
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
            <p>{task.feedback || "Причина не указана."}</p>
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
                Добавить пробел
              </button>
            )
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
                  {task.feedback || "Комментария нет."}
                </p>
              </>
            )}
          </section>
        </>
      )}
      {editable && (
        <div className="dp-task-footer">
          {!task.omitted && (
            <>
              <button
                className={"dp-task-complete" + (task.reviewed ? " is-checked" : "")}
                disabled={busy || (!task.reviewed && taskBlockers.length > 0)}
                onClick={markReviewed}
              >
                <CheckCheck size={16} />
                {task.reviewed ? "Задача проверена" : "Отметить задачу проверенной"}
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
            <p>{draft.feedback || "Комментария нет."}</p>
          </>
        )}
      </section>
      <div className="dp-review-extras">
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
          {task.reference ? <Formula value={task.reference} /> : <p>Правильный ответ не указан.</p>}
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
            <p>Версии появятся после подтверждения работы.</p>
          )}
        </Disclosure>
      </div>
    </>
  ) : (
    <div className="dp-empty">
      <h2>Задач пока нет</h2>
      <p>Добавьте задачу, чтобы начать разбор.</p>
    </div>
  );

  const analysisSection = (
    <Tabs.Root asChild value={task?.id ?? ""} onValueChange={selectTask}>
      <section
        id={ids.analysis}
        className="dp-analysis"
        aria-label="Задачи и шаги"
        role={narrow ? "tabpanel" : undefined}
      >
        <div className="dp-review-toolbar">
          {paneSwitch}
          {tasks.length > 1 ? (
            <Tabs.List className="dp-task-tabs dp-segmented" aria-label="Задачи">
              {tasks.map((item) => (
                <TaskTab key={item.id} task={item} />
              ))}
            </Tabs.List>
          ) : (
            task && (
              <p className="dp-task-single">
                <TaskLabel task={task} />
                <span className="dp-visually-hidden">, {taskState(task)}</span>
              </p>
            )
          )}
          {editable && (
            <button
              className="dp-icon dp-add-task"
              aria-label="Добавить задачу"
              title="Добавить задачу"
              disabled={busy}
              onClick={addTask}
            >
              <Plus size={16} />
            </button>
          )}
        </div>
        {tasks.length > 1 && task ? (
          <Tabs.Content ref={analysis} key={task.id} value={task.id} className="dp-analysis-body">
            {body}
          </Tabs.Content>
        ) : (
          <div ref={analysis} key={task?.id} className="dp-analysis-body">
            {body}
          </div>
        )}
      </section>
    </Tabs.Root>
  );

  return (
    <div className="dp-page dp-review-page">
      <PageBar
        trail={
          position >= 0 && (
            <span className="dp-review-trail">
              Работа {position + 1} из {queue.length}
            </span>
          )
        }
        actions={
          <>
            {!work.editing && (
              <button disabled={busy} onClick={() => void action("edit")}>
                <Pencil size={14} aria-hidden="true" />
                Начать новую версию
              </button>
            )}
            <DeleteWork work={work} />
          </>
        }
      />
      <Panel
        title="Разбор работы"
        className="dp-review-window"
        headerClassName="review-header"
        heading={
          <>
            <h1 title={work.title}>{work.title}</h1>
            <span className="dp-window-sub">
              {work.editing && (
                <span className="dp-window-meta dp-review-step">Шаг 2 из 3 · Проверка</span>
              )}
              <Link className="dp-window-meta" to={"/students/" + student.id}>
                {student.name} · {student.grade} класс
              </Link>
              <Badge status={work.status} />
            </span>
            {work.editing && (
              <span className="dp-save-state" aria-live="polite">
                {saveLabels[review.saveState]}
              </span>
            )}
          </>
        }
        closeBlocked={review.dirty}
        onClose={() => navigate("/works")}
      >
        <div className="dp-review-shell">
          {Boolean(error) && (
            <Callout
              tone="danger"
              role="alert"
              icon={<AlertCircle size={16} aria-hidden="true" />}
              title={errorText(error)}
            >
              {review.dirty && (
                <button
                  disabled={review.saving || busy}
                  onClick={() => void review.save().catch(() => {})}
                >
                  Сохранить
                </button>
              )}
            </Callout>
          )}
          {work.job ? (
            <Callout
              tone="neutral"
              role="status"
              icon={<LoaderCircle className="dp-spin" size={16} aria-hidden="true" />}
              title="ИИ разбирает работу. Можно уйти со страницы и вернуться позже."
            />
          ) : (
            work.editing &&
            stale &&
            (work.status === "failed" ? (
              <Callout
                tone="danger"
                icon={<AlertCircle size={16} aria-hidden="true" />}
                title="Разбор не удался."
                more="Запустите разбор заново или проверьте работу вручную по оригиналу."
              >
                {reanalyse}
                {finishSync}
              </Callout>
            ) : (
              <Callout
                tone="warning"
                icon={<AlertCircle size={16} aria-hidden="true" />}
                title="Сверьте распознанное с оригиналом."
                more={recheckNote(work, needsRecheck)}
              >
                {reanalyse}
                {finishSync}
              </Callout>
            ))
          )}
          {published && work.editing && (
            <Callout
              tone="info"
              icon={<ShieldCheck size={16} aria-hidden="true" />}
              title="Черновик новой версии."
              more={`Пока вы его не подтвердите, действует версия ${published.number}.`}
            >
              {reportLink}
              <button className="dp-text dp-danger-text" onClick={() => setWithdraw(true)}>
                Отозвать
              </button>
            </Callout>
          )}
          <div className={"dp-review-grid dp-show-" + pane}>
            {original}
            {analysisSection}
          </div>
          <footer
            className="dp-review-actions review-footer"
            ref={pinnedActions}
            aria-label="Завершение проверки"
          >
            {work.editing ? (
              <>
                <div className="dp-review-progress">
                  <span className="dp-progress-line">
                    <strong>
                      Проверено {checked} из {tasks.length}
                    </strong>
                    <span className="dp-progress-track" aria-hidden="true">
                      <span style={{ width: (checked / Math.max(1, tasks.length)) * 100 + "%" }} />
                    </span>
                  </span>
                  <span id={ids.reason} className="dp-review-reason">
                    {workHint || "Всё проверено, можно подтверждать"}
                  </span>
                </div>
                <div className="dp-review-buttons">
                  <button
                    className="dp-primary"
                    data-audit="confirm-work"
                    disabled={blockers.length > 0 || busy || review.saving}
                    aria-describedby={ids.reason}
                    onClick={() => void action("confirm")}
                  >
                    <ShieldCheck size={16} aria-hidden="true" />
                    <span>
                      Подтвердить<span className="dp-confirm-tail"> работу</span>
                    </span>
                  </button>
                  {nextButton(false)}
                </div>
              </>
            ) : (
              <>
                <div className="dp-confirmed">
                  <ShieldCheck size={16} aria-hidden="true" />
                  <p>
                    <strong>Версия {published?.number} подтверждена</strong>
                    <span className="dp-confirmed-note">
                      Карта знаний ученика обновлена. Следующий шаг: отчёт для ученика.
                    </span>
                  </p>
                </div>
                <div className="dp-review-buttons">
                  <button className="dp-text dp-danger-text" onClick={() => setWithdraw(true)}>
                    Отозвать
                  </button>
                  {reportLink}
                  {nextButton(true)}
                </div>
              </>
            )}
          </footer>
        </div>
      </Panel>
      <Modal
        open={!!step}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        title="Изменить шаг"
        description="Поправьте запись и объяснение. Если измените формулу, шаг нужно будет снова сверить с оригиналом."
      >
        {step && task && (
          <StepEditor
            key={step.id}
            step={step}
            preset={editor?.preset}
            index={task.steps.indexOf(step) + 1}
            explain={editor?.explain}
            removable={task.steps.length > 1}
            close={() => setEditor(null)}
            remove={() => {
              updateTask({
                steps: task.steps.filter((item) => item.id !== step.id),
                reviewed: false,
              });
              setEditor(null);
            }}
            save={(value) => {
              saveStep(value);
              setEditor(null);
            }}
          />
        )}
      </Modal>
      <Modal
        open={conditionEdit && !!task}
        onOpenChange={setConditionEdit}
        title={task ? "Условие · " + task.title : "Условие"}
        description="Текст, формула, правильный ответ и тема. Если измените условие, шаги нужно будет сверить заново."
      >
        {task && (
          <ConditionEditor
            key={task.id}
            task={task}
            removable={tasks.length > 1}
            close={() => setConditionEdit(false)}
            remove={() => {
              setConditionEdit(false);
              setRemoveTask(true);
            }}
            save={(value) => {
              if (!same(task, value)) updateTask(value);
              setConditionEdit(false);
            }}
          />
        )}
      </Modal>
      <Modal
        open={gapEdit && !!task?.gap}
        onOpenChange={setGapEdit}
        title="Гипотеза о пробеле"
        description="Тема попадёт в карту знаний, когда вы подтвердите пробел и работу."
      >
        {task?.gap && (
          <GapEditor
            key={task.id}
            gap={task.gap}
            close={() => setGapEdit(false)}
            save={(gap) => {
              if (!same(task.gap, gap)) updateTask({ gap, reviewed: false });
              setGapEdit(false);
            }}
          />
        )}
      </Modal>
      <Modal
        open={removeTask && !!task}
        onOpenChange={setRemoveTask}
        title={"Удалить " + (task?.title.replace(/^Задача/, "задачу") ?? "задачу") + "?"}
        description="Условие, шаги и комментарий к задаче удалятся из черновика."
      >
        <div className="dp-dialog-actions">
          <button onClick={() => setRemoveTask(false)}>Отмена</button>
          <button
            className="dp-destructive"
            onClick={() => {
              if (!task) return;
              const index = tasks.indexOf(task);
              const rest = tasks.filter((item) => item.id !== task.id);
              change({ ...draft, tasks: rest });
              setTaskId(rest[Math.min(index, rest.length - 1)]?.id ?? "");
              setRemoveTask(false);
            }}
          >
            Удалить задачу
          </button>
        </div>
      </Modal>
      <Modal
        open={withdraw}
        onOpenChange={setWithdraw}
        title="Отозвать подтверждение?"
        description="Работа останется в истории, но её пробелы уйдут из карты ученика."
      >
        <div className="dp-dialog-actions">
          <button onClick={() => setWithdraw(false)}>Отмена</button>
          <button
            className="dp-destructive"
            disabled={busy}
            onClick={() => void action("withdraw").then((done) => done && setWithdraw(false))}
          >
            Отозвать подтверждение
          </button>
        </div>
      </Modal>
      <Modal
        open={review.blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open && review.blocker.state === "blocked") review.blocker.reset();
        }}
        title="Сохранить изменения?"
        description="Черновик ещё сохраняется. Дождитесь, чтобы не потерять правки."
      >
        {Boolean(error) && (
          <p className="dp-error" role="alert">
            {errorText(error)}
          </p>
        )}
        <div className="dp-dialog-actions">
          <button onClick={() => review.blocker.state === "blocked" && review.blocker.reset()}>
            Остаться
          </button>
          <button
            className="dp-primary"
            onClick={() => {
              void review
                .save()
                .then(() => {
                  if (review.blocker.state === "blocked") review.blocker.proceed();
                })
                .catch(() => {});
            }}
          >
            Сохранить и перейти
          </button>
        </div>
      </Modal>
    </div>
  );
}
