import { useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CircleHelp,
  Copy,
  Download,
  History,
  LoaderCircle,
  ShieldCheck,
  Target,
} from "lucide-react";
import { gateway } from "../../data/gateway";
import { topicById } from "../../data/catalog";
import { reportText } from "../../domain/review";
import { Formula, MixedText } from "../../shared/math";
import {
  Avatar,
  Callout,
  Modal,
  PageBar,
  PageLoading,
  PageState,
  Panel,
  Wordmark,
} from "../../shared/ui";
import { verdictMeta } from "../../shared/status";
import { date, errorText } from "../../shared/text";
import { MediaViewer } from "../../shared/MediaViewer";
import "./report.css";
import { ReportFormulaError } from "./formulaValidation";
import { useActiveTime } from "../timing/useActiveTime";
export default function Report() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const revisionId = params.get("revision") || undefined;
  useActiveTime("export", id);
  const query = useQuery({
    queryKey: ["report", id, revisionId],
    queryFn: () => gateway.report(id!, revisionId),
    staleTime: 0,
  });
  const [copy, setCopy] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  const copyText = useRef<HTMLTextAreaElement>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<unknown>();
  if (query.isPending) return <PageLoading variant="report" />;
  if (!query.data)
    return (
      <PageState
        title="Отчёт недоступен"
        errorTitle="Не удалось загрузить отчёт"
        error={query.error}
        retry={() => void query.refetch()}
        to={"/works/" + id}
        linkLabel="К разбору работы"
      />
    );
  const report = query.data;
  const { work, student, revision } = report;
  const copyReport = async () => {
    setError(undefined);
    setCopy(false);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(reportText(report));
      setCopy(true);
      setTimeout(() => setCopy(false), 2500);
    } catch {
      setManualCopy(true);
    }
  };
  const exportPdf = async () => {
    setExporting(true);
    setError(undefined);
    try {
      const module = await import("./exportPdf");
      await module.downloadReport(report);
    } catch (cause) {
      setError(cause);
    } finally {
      setExporting(false);
    }
  };
  const archived = revision.id !== work.currentPublishedId;
  return (
    <div className="dp-page dp-report-page">
      <PageBar
        trail={
          <>
            <Link to={"/works/" + work.id}>{work.title}</Link>
            <span>Отчёт</span>
          </>
        }
        actions={
          <>
            <button className="dp-compact-action" onClick={() => void copyReport()}>
              {copy ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <Copy size={16} aria-hidden="true" />
              )}
              <span>{copy ? "Скопировано" : "Скопировать текст"}</span>
            </button>
            <button
              className="dp-primary dp-compact-action"
              disabled={exporting}
              onClick={() => void exportPdf()}
            >
              {exporting ? (
                <LoaderCircle className="dp-spin" size={16} aria-hidden="true" />
              ) : (
                <Download size={16} aria-hidden="true" />
              )}
              <span>{exporting ? "Готовим PDF…" : "Скачать PDF"}</span>
            </button>
          </>
        }
      />
      <Panel
        title="Отчёт по работе"
        className="dp-report-window"
        headerClassName="page-header"
        heading={
          <>
            <h1>Отчёт по работе</h1>
            <span className="dp-window-meta">
              {work.assignmentId ? "" : "Шаг 3 из 3 · "}версия {revision.number} ·{" "}
              {date(revision.confirmedAt)}
            </span>
            {archived && <span className="dp-report-archived">Архивная</span>}
          </>
        }
        onClose={() => navigate("/works/" + work.id)}
      >
        <div className="dp-report-toolbar">
          <Link className="dp-text" to={"/works/" + work.id}>
            <ArrowLeft size={16} aria-hidden="true" />К разбору работы
          </Link>
        </div>
        {archived && (
          <Callout
            tone="warning"
            icon={<History size={16} aria-hidden="true" />}
            title="Это старая версия отчёта. В карте знаний учтена более новая"
          />
        )}
        {Boolean(error) && (
          <Callout
            tone="danger"
            role="alert"
            icon={<AlertCircle size={16} aria-hidden="true" />}
            title={error instanceof ReportFormulaError ? error.message : errorText(error)}
            more={
              error instanceof ReportFormulaError && archived
                ? "Архивную версию изменить нельзя. Начните новую версию работы"
                : undefined
            }
          >
            {error instanceof ReportFormulaError && (
              <Link
                className="dp-button"
                to={"/works/" + work.id + "?task=" + encodeURIComponent(error.taskId)}
              >
                {archived ? "К новой версии" : "Исправить формулу"}
              </Link>
            )}
          </Callout>
        )}
        <div className="dp-report-canvas">
          <article className="dp-report-sheet report-paper">
            <header className="dp-report-head">
              <Wordmark className="dp-report-brand" />
              <span className="dp-caption">Для ученика и родителей</span>
            </header>
            <h2>{work.title}</h2>
            <p className="dp-report-student">
              <Avatar student={student} size="sm" />
              {student.name} · {student.grade} класс
            </p>
            <p className="dp-report-approval">
              <ShieldCheck size={16} aria-hidden="true" />
              Проверено репетитором · версия {revision.number} · {date(revision.confirmedAt)}
            </p>
            {revision.draft.tasks.map((task) => {
              const topic = task.gap ? topicById(task.gap.topicId) : undefined;
              return (
                <section className="dp-report-task" key={task.id}>
                  <h3>{task.title}</h3>
                  {task.condition && (
                    <p className="dp-report-condition-text">
                      <MixedText value={task.condition} />
                    </p>
                  )}
                  {task.conditionAttachmentIds?.length ? (
                    <div className="dp-report-attachments">
                      <MediaViewer
                        files={revision.attachments.filter((file) =>
                          task.conditionAttachmentIds?.includes(file.id),
                        )}
                      />
                    </div>
                  ) : null}
                  {task.formula && (
                    <div className="dp-report-condition">
                      <Formula value={task.formula} />
                    </div>
                  )}
                  {task.omitted ? (
                    <div className="dp-report-note dp-tone-warning">
                      <CircleHelp size={16} aria-hidden="true" />
                      <p>
                        Разберём отдельно. {task.feedback || "Решение посмотрим вместе на занятии."}
                      </p>
                    </div>
                  ) : (
                    <>
                      <ol className="dp-report-steps">
                        {task.steps.map((step, index) => {
                          const { label, tone, Icon } = verdictMeta[step.verdict];
                          return (
                            <li
                              className={"dp-report-step dp-tone-" + tone + " is-" + step.verdict}
                              key={step.id}
                            >
                              <span className="dp-report-step-number">{index + 1}</span>
                              <span className="dp-report-verdict">
                                <Icon size={14} aria-hidden="true" />
                                {label}
                              </span>
                              <div className="dp-report-formula">
                                <Formula value={step.latex} />
                              </div>
                              {step.explanation && (
                                <p>
                                  <MixedText value={step.explanation} />
                                </p>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                      {task.feedback && (
                        <div className="dp-report-feedback">
                          <h4>Комментарий</h4>
                          <p>
                            <MixedText value={task.feedback} />
                          </p>
                        </div>
                      )}
                      {task.gap?.decision === "confirmed" && (
                        <div className="dp-report-recommendation">
                          <h4>
                            <Target size={14} aria-hidden="true" />
                            Что повторить{topic ? " · " + topic.name : ""}
                          </h4>
                          <p>{task.gap.reason}</p>
                        </div>
                      )}
                    </>
                  )}
                </section>
              );
            })}
            {revision.draft.feedback && (
              <section className="dp-report-next">
                <h3>Что дальше</h3>
                <p>{revision.draft.feedback}</p>
              </section>
            )}
            <footer>
              UpGrade · версия {revision.number} · {date(revision.confirmedAt)}
            </footer>
          </article>
        </div>
      </Panel>
      <Modal
        open={manualCopy}
        onOpenChange={setManualCopy}
        title="Скопировать текст отчёта"
        description="Браузер не дал скопировать текст сам. Текст уже выделен, нажмите ⌘C или Ctrl+C. На телефоне выберите «Копировать» в меню"
        initialFocusRef={copyText}
      >
        <label>
          Текст отчёта
          <textarea
            className="manual-copy-text"
            ref={copyText}
            readOnly
            value={reportText(report)}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
        <div className="dp-dialog-actions">
          <button className="dp-primary" onClick={() => setManualCopy(false)}>
            Готово
          </button>
        </div>
      </Modal>
    </div>
  );
}
