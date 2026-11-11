import type { Closure } from "../../domain/models";
import { Disclosure } from "../../shared/ui";
import { closureTitle, dateTime } from "./knowledge";
import "./knowledge.css";
export function GapHistory({ events }: { events: Closure[] }) {
  if (!events.length) return null;
  return (
    <div className="gap-history">
      <Disclosure title={"История изменений · " + events.length}>
        <ol className="dp-gap-history">
          {[...events].reverse().map((event, index) => (
            <li key={event.at + "-" + index}>
              <strong>{closureTitle(event)}</strong>
              <time dateTime={event.at}>{dateTime.format(new Date(event.at))}</time>
              {event.note && <p>{event.note}</p>}
            </li>
          ))}
        </ol>
      </Disclosure>
    </div>
  );
}

export function ClosureNote({ closure }: { closure: Closure }) {
  return (
    <>
      {closure.note && <blockquote className="dp-closure-note">{closure.note}</blockquote>}
      <p className="dp-closure-date">
        Закрыт <time dateTime={closure.at}>{dateTime.format(new Date(closure.at))}</time>
      </p>
    </>
  );
}
