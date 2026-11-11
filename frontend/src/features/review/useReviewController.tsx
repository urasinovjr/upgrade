import { ArrowRight, Check, FileText } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams, useViewTransitionState } from "react-router";
import { serverMode } from "../../data/gateway";
import { needsAttention, sortQueue } from "../../domain/analytics";
import type { Step, Student, Task, Work } from "../../domain/models";
import { namePlaceLabels, namePlaces, studentNames } from "../../domain/nameGuard";
import { uncheckedPages } from "../../domain/redaction";
import { blankTask, currentRevision, reviewBlockers } from "../../domain/review";
import type { OriginFocus } from "../../domain/stepOrigin";
import { usePinnedActions } from "../../shared/layout";
import { MediaViewer } from "../../shared/MediaViewer";
import { cancelContentChange, changeContent } from "../../shared/ui/motion";
import { useMediaQuery } from "../../shared/useMediaQuery";
import "../homework/homework.css";
import { useActiveTime } from "../timing/useActiveTime";
import { Reanalyse } from "./Reanalyse";
import "./review.css";
import { PaneSwitch, type Pane } from "./ReviewPresentation";
import { blockerHint, same, taskIssues } from "./reviewView";
import { useReviewDraft } from "./useReviewDraft";
const narrowQuery = "(max-width: 1199px)";
export function useReviewController({
  work,
  student,
  works,
}: {
  work: Work;
  student: Student;
  works: Work[];
}) {
  const moving = useViewTransitionState("/works/" + work.id);
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
  const [materialsOpen, setMaterialsOpen] = useState(false);
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
  const showCondition = (task: Task) => {
    const area = task.conditionRegion;
    if (!area) return;
    setFocus((current) => ({ ...area, label: "Условие здесь", nonce: (current?.nonce ?? 0) + 1 }));
    if (narrow) changePane("original");
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
        aria-label="Следующая работа"
        title={"Следующая работа: " + nextWork.title}
      >
        <span className="dp-next-label">Следующая</span>
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
      nameIssues={namePlaceLabels(namePlaces(studentNames(student), draft.tasks), draft.tasks)}
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
        selectionKey={work.id}
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

  return {
    work,
    student,
    works,
    moving,
    review,
    draft,
    change,
    canEdit,
    busy,
    needsRecheck,
    blockers,
    action,
    navigate,
    narrow,
    pinnedActions,
    params,
    setParams,
    requested,
    taskId,
    setTaskId,
    lastRequested,
    setLastRequested,
    pane,
    setPane,
    focus,
    setFocus,
    editor,
    setEditor,
    conditionEdit,
    setConditionEdit,
    materialsOpen,
    setMaterialsOpen,
    gapEdit,
    setGapEdit,
    withdraw,
    setWithdraw,
    removeTask,
    setRemoveTask,
    analysis,
    focusTab,
    ids,
    shownTask,
    tasks,
    task,
    editable,
    published,
    queue,
    position,
    nextWork,
    checked,
    workHint,
    step,
    pages,
    stale,
    updateTask,
    saveStep,
    selectTask,
    markReviewed,
    addTask,
    changePane,
    showCondition,
    showOrigin,
    paneSwitch,
    nextButton,
    reportLink,
    reanalyse,
    finishSync,
    error,
    original,
    conditionFiles,
    taskBlockers,
    taskHint,
    initial,
  };
}
export type ReviewController = ReturnType<typeof useReviewController>;
