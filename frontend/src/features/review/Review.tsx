import * as Tabs from "@radix-ui/react-tabs";
import { AlertCircle, LoaderCircle, Pencil, Plus, ShieldCheck } from "lucide-react";
import { Link, useParams } from "react-router";
import type { Student, Work } from "../../domain/models";
import { useStore } from "../../shared/query";
import { errorText } from "../../shared/text";
import { Badge, Callout, PageBar, PageLoading, PageState, Panel } from "../../shared/ui";
import "../homework/homework.css";
import { FirstVisitHint } from "../onboarding/FirstVisitHint";
import { DeleteWork } from "./DeleteWork";
import "./review.css";
import { ReviewActions } from "./ReviewActions";
import { ReviewBody } from "./ReviewBody";
import { ReviewDialogs } from "./ReviewDialogs";
import { TaskLabel, TaskTab } from "./ReviewPresentation";
import { recheckNote, saveLabels, taskState } from "./reviewView";
import { useReviewController } from "./useReviewController";
export default function Review() {
  const { id } = useParams();
  const query = useStore();
  if (query.isPending) return <PageLoading variant="review" />;
  if (!query.data)
    return (
      <PageState
        title="Разбор работы"
        errorTitle="Не удалось загрузить разбор работы"
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  const work = query.data.works.find((item) => item.id === id);
  if (!work)
    return (
      <PageState
        title="Работа не найдена. Откройте очередь проверки"
        description="Проверьте ссылку или выберите работу из списка"
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
  const context = useReviewController({ work, student, works });
  const {
    busy,
    narrow,
    analysis,
    ids,
    tasks,
    task,
    editable,
    selectTask,
    addTask,
    paneSwitch,
    moving,
    review,
    needsRecheck,
    action,
    navigate,
    pane,
    setWithdraw,
    published,
    queue,
    position,
    stale,
    reportLink,
    reanalyse,
    finishSync,
    error,
    original,
  } = context;
  const body = <ReviewBody context={context} />;
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
          {editable && !work.assignmentId && (
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
          work.submissionSnapshot?.homeworkId ? (
            <Link to={"/homework/" + work.submissionSnapshot.homeworkId}>К назначенному ДЗ</Link>
          ) : (
            position >= 0 && (
              <span className="dp-review-trail">
                Работа {position + 1} из {queue.length}
              </span>
            )
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
            <h1
              title={work.title}
              style={moving ? { viewTransitionName: "dp-work-title" } : undefined}
            >
              {work.title}
            </h1>
            <span className="dp-window-sub">
              {work.editing && (
                <span className="dp-window-meta dp-review-step">
                  {work.assignmentId ? "Проверка сдачи" : "Шаг 2 из 3 · Проверка"}
                </span>
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
        <FirstVisitHint id="review" />
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
              title="ИИ разбирает работу. Можно уйти со страницы и вернуться позже"
            />
          ) : (
            work.editing &&
            stale &&
            (work.status === "failed" ? (
              <Callout
                tone="danger"
                icon={<AlertCircle size={16} aria-hidden="true" />}
                title="Разбор не удался"
                more="Запустите разбор заново или проверьте работу вручную по оригиналу"
              >
                {reanalyse}
                {finishSync}
              </Callout>
            ) : (
              <Callout
                tone="warning"
                icon={<AlertCircle size={16} aria-hidden="true" />}
                title="Сверьте распознанное с оригиналом"
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
              title="Черновик новой версии"
              more={`Пока вы его не опубликуете, действует версия ${published.number}`}
            >
              {reportLink}
              <button className="dp-text dp-danger-text" onClick={() => setWithdraw(true)}>
                Отозвать публикацию
              </button>
            </Callout>
          )}
          {!published && work.editing && !work.job && (
            <p className="dp-caption" role="status">
              {work.status === "preparation"
                ? "Подготовка решения к проверке"
                : work.manual
                  ? "Ручная сверка · результат ещё не опубликован"
                  : "Черновик ИИ · результат ещё не опубликован"}
            </p>
          )}
          <div className={"dp-review-grid dp-show-" + pane}>
            {original}
            {analysisSection}
          </div>
          <ReviewActions context={context} />
        </div>
      </Panel>
      <ReviewDialogs context={context} />
    </div>
  );
}
