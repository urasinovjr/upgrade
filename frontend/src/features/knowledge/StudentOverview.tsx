import { CircleHelp, FileText, Map as MapIcon, Plus } from "lucide-react";
import { type CSSProperties } from "react";
import { Link } from "react-router";
import { topicShortName } from "../../domain/analytics";
import { currentRevision } from "../../domain/review";
import { statusMeta } from "../../shared/status";
import { date } from "../../shared/text";
import { ErrorMessage } from "../../shared/ui";
import { statusOf } from "./knowledge";
import "./knowledge.css";
import { recentLimit } from "./studentView";
import type { StudentDetailState } from "./useStudentDetail";
export function StudentOverview({ context }: { context: StudentDetailState }) {
  const {
    student,
    command,
    writeAccess,
    gaps,
    open,
    closed,
    works,
    stripTopics,
    defaultTopic,
    tab,
    showOnMap,
    closing,
    gapOf,
    newWorkLink,
    gapItem,
  } = context;
  return (
    <>
      {tab === "overview" && (
        <>
          {stripTopics.length > 0 && (
            <section className="dp-student-topics" aria-labelledby="student-topics-title">
              <h2 id="student-topics-title">Темы</h2>
              <ul style={{ "--topic-count": stripTopics.length } as CSSProperties}>
                {stripTopics.map((item) => {
                  const status = statusOf(gapOf(item.id));
                  const label = item.name + " · " + status.label;
                  return (
                    <li key={item.id}>
                      <button
                        className={"dp-student-topic is-" + status.key}
                        aria-label={label}
                        title={label}
                        onClick={() => showOnMap(item.id)}
                      >
                        <span className="dp-student-topic-bar" aria-hidden="true" />
                        <span className="dp-student-topic-name" aria-hidden="true">
                          {item.name}
                        </span>
                        <span className="dp-student-topic-short" aria-hidden="true">
                          {topicShortName(item)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <ErrorMessage error={!closing && command.error} />
          <div className="dp-student-grid">
            <section className="dp-student-section" aria-labelledby="student-gaps-title">
              <div className="dp-student-heading">
                <h2 id="student-gaps-title">
                  Открытые пробелы
                  <span className="dp-count">{open.length}</span>
                </h2>
                <button className="dp-text" onClick={() => showOnMap(defaultTopic)}>
                  <MapIcon size={14} aria-hidden="true" />
                  Открыть карту
                </button>
              </div>
              {open.length ? (
                <ul className="dp-student-gap-list">
                  {open.map((gap, index) => gapItem(gap, index === 0))}
                </ul>
              ) : (
                <div className="dp-student-empty">
                  <CircleHelp size={16} aria-hidden="true" />
                  <p>
                    {gaps.length ? "Открытых пробелов нет." : "Подтверждённых пробелов пока нет."}{" "}
                    Они появятся, когда вы опубликуете результаты этого ученика
                  </p>
                </div>
              )}
              {closed.length > 0 && (
                <>
                  <h3 className="dp-student-subheading">
                    Закрытые пробелы
                    <span className="dp-count">{closed.length}</span>
                  </h3>
                  <ul className="dp-student-gap-list">
                    {closed.map((gap) => gapItem(gap, false))}
                  </ul>
                </>
              )}
            </section>
            <section className="dp-student-section" aria-labelledby="student-works-title">
              <div className="dp-student-heading">
                <h2 id="student-works-title">
                  Последние работы
                  <span className="dp-count">{works.length}</span>
                </h2>
                {writeAccess.allowed && (
                  <Link className="dp-text" to={newWorkLink}>
                    <Plus size={14} aria-hidden="true" />
                    Создать ДЗ
                  </Link>
                )}
              </div>
              {works.length ? (
                <ul className="dp-student-works">
                  {works.slice(0, recentLimit).map((work) => {
                    const { label, tone, Icon } = statusMeta[work.status];
                    const current = currentRevision(work);
                    return (
                      <li key={work.id}>
                        <Link className="dp-student-work" to={"/works/" + work.id}>
                          <span className={"dp-student-work-status dp-tone-" + tone} title={label}>
                            <Icon size={16} aria-hidden="true" />
                            <span className="dp-visually-hidden">{label}:</span>
                          </span>
                          <span className="dp-student-work-title">{work.title}</span>
                          <time dateTime={work.createdAt}>{date(work.createdAt)}</time>
                        </Link>
                        {current && (
                          <Link
                            className="dp-student-work-report"
                            to={`/works/${work.id}/report?revision=${current.id}`}
                          >
                            Отчёт, версия {current.number}
                            <span className="dp-visually-hidden"> · {work.title}</span>
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="dp-student-empty">
                  <FileText size={16} aria-hidden="true" />
                  <p>Работ пока нет</p>
                </div>
              )}
              {works.length > recentLimit && (
                <Link
                  className="dp-text dp-student-all-works"
                  to={"/works?view=all&student=" + encodeURIComponent(student.id)}
                >
                  Все работы ученика · {works.length}
                </Link>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
