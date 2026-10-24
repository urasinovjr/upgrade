import { Link } from "react-router";
import { ChevronRight, CircleHelp } from "lucide-react";
import { plural } from "../../../domain/analytics";
import { commonGaps, inactiveStudents, pendingHypotheses } from "../../../domain/insights";
import type { StoreState, Topic } from "../../../domain/models";
import { Avatar } from "../../../shared/ui";
import { Timeline } from "../../knowledge/Timeline";
import { topicMapLink } from "../../knowledge/links";
import { WidgetEmpty, WidgetSection } from "./WidgetSection";

const inactiveDays = 14;
const hypothesisLimit = 6;

export function Events({ state }: { state: StoreState }) {
  const names = new Map(state.students.map((student) => [student.id, student.name]));
  return (
    <WidgetSection title="Лента событий" caption="Последние события по всем ученикам">
      <Timeline
        works={state.works}
        closures={state.closures}
        limit={6}
        studentName={(id) => names.get(id)}
      />
    </WidgetSection>
  );
}

export function Inactive({ state }: { state: StoreState }) {
  const students = inactiveStudents(state, inactiveDays);
  return (
    <WidgetSection
      title="Давно не сдавали"
      caption={`Нет новых работ ${inactiveDays} дней и дольше`}
      count={students.length}
    >
      {students.length ? (
        <ul className="dp-insight-list">
          {students.map(({ student, idleDays }) => (
            <li key={student.id}>
              <Link className="dp-insight-row" to={"/students/" + student.id}>
                <Avatar student={student} size="sm" />
                <span>
                  <strong>{student.name}</strong>
                  <small>
                    {idleDays === null
                      ? "Работ ещё нет"
                      : plural(idleDays, ["день", "дня", "дней"]) + " без новых работ"}
                  </small>
                </span>
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <WidgetEmpty>Все ученики сдавали работы за последние {inactiveDays} дней.</WidgetEmpty>
      )}
    </WidgetSection>
  );
}

export function CommonGaps({ state, topics }: { state: StoreState; topics: Topic[] }) {
  const rows = commonGaps(state, topics);
  return (
    <WidgetSection title="Частые пробелы" caption="Темы по числу учеников с открытым пробелом">
      {rows.length ? (
        <ul className="dp-insight-list">
          {rows.map(({ topicId, name, students }) => (
            <li key={topicId} className="dp-gap-row">
              <span>
                <strong>{name}</strong>
                <small>{plural(students.length, ["ученик", "ученика", "учеников"])}</small>
              </span>
              <span className="dp-gap-students">
                {students.map((student) => (
                  <Link
                    key={student.id}
                    to={topicMapLink(student.id, topicId)}
                    aria-label={`${name}: ${student.name}`}
                    title={student.name}
                  >
                    <Avatar student={student} size="sm" />
                  </Link>
                ))}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <WidgetEmpty>Общих пробелов у учеников нет.</WidgetEmpty>
      )}
    </WidgetSection>
  );
}

export function Hypotheses({ state, topics }: { state: StoreState; topics: Topic[] }) {
  const pending = pendingHypotheses(state, topics);
  const shown = pending.slice(0, hypothesisLimit);
  return (
    <WidgetSection
      title="Гипотезы на проверку"
      caption="Возможные пробелы из разбора, которые ждут решения"
      count={pending.length}
    >
      {pending.length ? (
        <ul className="dp-insight-list">
          {shown.map(({ work, student, task, topicName }) => (
            <li key={work.id + ":" + task.id}>
              <Link className="dp-insight-row" to={`/works/${work.id}?task=${task.id}`}>
                <span className="dp-insight-icon dp-tone-warning">
                  <CircleHelp size={16} aria-hidden="true" />
                </span>
                <span>
                  <strong>{topicName}</strong>
                  <small>
                    {[student?.name, work.title, task.title].filter(Boolean).join(" · ")}
                  </small>
                </span>
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <WidgetEmpty>Новых гипотез нет. Они появятся после разбора работ.</WidgetEmpty>
      )}
      {pending.length > shown.length && (
        <p className="dp-insight-more">
          Ещё {plural(pending.length - shown.length, ["гипотеза", "гипотезы", "гипотез"])} в работах
        </p>
      )}
    </WidgetSection>
  );
}
