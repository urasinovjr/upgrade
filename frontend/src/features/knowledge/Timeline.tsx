import { CircleCheck, FilePlus2, Target, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import type { Closure, Work } from "../../domain/models";
import { statusMeta, type Tone } from "../../shared/status";
import { closureTitle, dateTime, topicName } from "./knowledge";
import { topicMapLink } from "./links";
import "./timeline.css";

type Kind = "created" | "confirmed" | "close" | "reopen";
const kinds: Record<Kind, { tone: Tone; Icon: LucideIcon }> = {
  created: { tone: "neutral", Icon: FilePlus2 },
  confirmed: { tone: statusMeta.confirmed.tone, Icon: statusMeta.confirmed.Icon },
  close: { tone: "success", Icon: CircleCheck },
  reopen: { tone: "warning", Icon: Target },
};

type Event = {
  id: string;
  at: string;
  kind: Kind;
  title: string;
  text: string;
  href: string;
  studentId: string;
  topicId?: string;
};

function timelineEvents(works: Work[], closures: Closure[]): Event[] {
  return [
    ...works.flatMap((work) => [
      {
        id: work.id,
        at: work.createdAt,
        kind: "created" as const,
        title: "Работа добавлена",
        text: work.title,
        href: "/works/" + work.id,
        studentId: work.studentId,
      },
      ...work.published.map((revision) => ({
        id: revision.id,
        at: revision.confirmedAt,
        kind: "confirmed" as const,
        title: `Подтверждена редакция ${revision.number}`,
        text: work.title,
        href: `/works/${work.id}/report?revision=${revision.id}`,
        studentId: work.studentId,
      })),
    ]),
    ...closures.map((closure, index) => ({
      id: `closure-${index}`,
      at: closure.at,
      kind: closure.action,
      title: closureTitle(closure),
      text: topicName(closure.topicId) + (closure.note ? " — " + closure.note : ""),
      href: topicMapLink(closure.studentId, closure.topicId),
      studentId: closure.studentId,
      topicId: closure.topicId,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
}

export function Timeline({
  works,
  closures,
  onOpenTopic,
  limit,
  studentName,
}: {
  works: Work[];
  closures: Closure[];
  onOpenTopic?: (topicId: string) => void;
  limit?: number;
  studentName?: (studentId: string) => string | undefined;
}) {
  const events = timelineEvents(works, closures).slice(0, limit);
  return (
    <ol className="dp-timeline">
      {events.map((event) => {
        const { tone, Icon } = kinds[event.kind];
        const name = studentName?.(event.studentId);
        const text = name ? name + " · " + event.text : event.text;
        return (
          <li key={event.id} data-kind={event.kind}>
            <Link
              className="dp-timeline-row"
              to={event.href}
              onClick={(click) => {
                const { topicId } = event;
                if (!topicId || !onOpenTopic || click.button !== 0) return;
                if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return;
                click.preventDefault();
                onOpenTopic(topicId);
              }}
            >
              <span className={"dp-timeline-icon dp-tone-" + tone}>
                <Icon size={16} aria-hidden="true" />
              </span>
              <div className="dp-timeline-text">
                <h3>{event.title}</h3>
                <span title={text}>{text}</span>
              </div>
              <time dateTime={event.at}>{dateTime.format(new Date(event.at))}</time>
            </Link>
          </li>
        );
      })}
      {!events.length && (
        <li className="dp-timeline-empty">История появится после первой работы.</li>
      )}
    </ol>
  );
}
