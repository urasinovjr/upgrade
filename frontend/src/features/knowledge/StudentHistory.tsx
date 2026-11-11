import { Timeline } from "./Timeline";
import "./knowledge.css";
import type { StudentDetailState } from "./useStudentDetail";
export function StudentHistory({ context }: { context: StudentDetailState }) {
  const { works, closures, tab, showOnMap } = context;
  return (
    <>
      {tab === "history" && (
        <section className="dp-student-section" aria-labelledby="student-history-title">
          <h2 id="student-history-title" className="dp-visually-hidden">
            История
          </h2>
          <Timeline works={works} closures={closures} onOpenTopic={showOnMap} />
        </section>
      )}
    </>
  );
}
