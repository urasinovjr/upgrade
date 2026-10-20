import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronRight, Target } from "lucide-react";
import type { StoreState, Student } from "../../domain/models";
import {
  studentSignals,
  topicShortName,
  topicStatusLabel,
  topicStrip,
} from "../../domain/analytics";
import { statusMeta } from "../../shared/status";
import { Avatar } from "../../shared/ui";
import { topicName, topicOrder } from "../knowledge/knowledge";
import { topicMapLink } from "../knowledge/links";
import "./roster.css";

const stripStatuses = ["gap", "closed", "path", "none"] as const;

export function Roster({
  state,
  students = state.students.filter((student) => !student.archivedAt),
  full = false,
  labelledBy = "roster-title",
  empty,
}: {
  state: StoreState;
  students?: Student[];
  full?: boolean;
  labelledBy?: string;
  empty?: ReactNode;
}) {
  const nameCell = (student: Student) => (
    <Link className="dp-roster-name" to={"/students/" + student.id}>
      <Avatar student={student} size="sm" />
      <strong>{student.name}</strong>
      <small>{student.grade} кл.</small>
    </Link>
  );
  return (
    <section className={"dp-roster" + (full ? " dp-roster-full" : "")} aria-labelledby={labelledBy}>
      {(!full || students.length > 0) && (
        <div className="dp-roster-columns">
          {full ? (
            <span className="dp-roster-col-name" aria-hidden="true">
              Ученик
            </span>
          ) : (
            <h2 id={labelledBy}>
              Ученики <span className="dp-count">{state.students.length}</span>
            </h2>
          )}
          {students.length > 0 && (
            <>
              <span className="dp-roster-col-signals" aria-hidden="true">
                Открыто
              </span>
              <span className="dp-topic-strip" aria-hidden="true">
                {topicOrder.map((topic) => (
                  <span key={topic.id} className="dp-topic-col" title={topic.name}>
                    {topicShortName(topic)}
                  </span>
                ))}
              </span>
            </>
          )}
        </div>
      )}
      {students.length ? (
        <ul className="dp-roster-list">
          {students.map((student) => {
            const signals = studentSignals(state, student.id);
            return (
              <li key={student.id} className={"dp-roster-row" + (full ? " student-card" : "")}>
                {full ? (
                  <div className="dp-roster-who">
                    <h2>{nameCell(student)}</h2>
                    {student.goal && (
                      <p className="dp-roster-goal" title={student.goal}>
                        {student.goal}
                      </p>
                    )}
                  </div>
                ) : (
                  nameCell(student)
                )}
                <span className="dp-signals">
                  {signals.length ? (
                    signals.map((signal) => {
                      const { Icon, tone } =
                        signal.key === "gaps"
                          ? { Icon: Target, tone: "warning" }
                          : statusMeta[signal.key];
                      return (
                        <span key={signal.key} className={"dp-signal dp-tone-" + tone}>
                          <Icon size={12} aria-hidden="true" />
                          {signal.label}
                        </span>
                      );
                    })
                  ) : (
                    <span className="dp-signal is-quiet">нет открытых задач</span>
                  )}
                </span>
                <span className="dp-topic-strip" role="group" aria-label={"Темы · " + student.name}>
                  {topicStrip(state, student.id, topicOrder).map((cell) => {
                    const text =
                      cell.status === "path"
                        ? `${cell.name} — путь к пробелу «${topicName(cell.target)}»`
                        : `${cell.name} — ${topicStatusLabel[cell.status]}`;
                    return (
                      <Link
                        key={cell.topicId}
                        className="dp-topic-link"
                        to={topicMapLink(student.id, cell.target)}
                        aria-label={text}
                        title={text}
                      >
                        <i className={"dp-topic-cell is-" + cell.status} />
                      </Link>
                    );
                  })}
                </span>
                <ChevronRight className="dp-roster-chevron" size={16} aria-hidden="true" />
              </li>
            );
          })}
        </ul>
      ) : (
        (empty ?? (
          <p className="dp-roster-empty">
            Учеников пока нет.{" "}
            <Link to="/students" state={{ addStudent: true }}>
              Добавить ученика
            </Link>
          </p>
        ))
      )}
      {students.length > 0 && (
        <p className="dp-strip-legend" aria-hidden="true">
          {stripStatuses.map((status) => (
            <span key={status}>
              <i className={"dp-topic-cell is-" + status} />
              {topicStatusLabel[status]}
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
