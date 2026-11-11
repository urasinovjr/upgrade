import { Plus } from "lucide-react";
import { Link } from "react-router";
import { ErrorMessage, Panel } from "../../shared/ui";
import { KnowledgeMap, MapLegend } from "./KnowledgeMap";
import { ClosureNote, GapHistory } from "./StudentPresentation";
import { statusOf, topicName } from "./knowledge";
import "./knowledge.css";
import type { StudentDetailState } from "./useStudentDetail";
export function StudentMap({ context }: { context: StudentDetailState }) {
  const {
    command,
    writeAccess,
    gaps,
    view,
    tab,
    selected,
    map,
    detail,
    selectTopic,
    closing,
    gapOf,
    selectedGap,
    topic,
    selectedStatus,
    newWorkLink,
    historyOf,
    evidence,
    closure,
  } = context;
  return (
    <>
      {tab === "map" && (
        <Panel
          className="dp-student-map"
          title="Карта знаний"
          summary={topic.name}
          onClose={() => view.changeTab("overview")}
        >
          <div className="dp-map-layout">
            <section className="dp-map-canvas" aria-label="Связи тем">
              {map && (
                <KnowledgeMap map={map} gaps={gaps} selected={selected} onSelect={selectTopic} />
              )}
              <MapLegend />
            </section>
            <section ref={detail} key={selected} className="dp-topic-detail">
              <span className="dp-topic-detail-label">Выбранная тема</span>
              <h2>{topic.name}</h2>
              <span className={"dp-topic-status dp-tone-" + selectedStatus.tone}>
                <selectedStatus.Icon size={14} aria-hidden="true" />
                {selectedGap ? selectedStatus.label : "Нет подтверждённых данных"}
              </span>
              <p>{topic.description}</p>
              {selectedGap ? (
                <div className="dp-topic-detail-block">
                  <h3>Что повторить</h3>
                  <p>{selectedGap.reason}</p>
                  {selectedGap.closed && selectedGap.closure && (
                    <ClosureNote closure={selectedGap.closure} />
                  )}
                  {evidence(selectedGap)}
                  {closure(selectedGap)}
                  <ErrorMessage error={!closing && command.error} />
                  <GapHistory events={historyOf(selectedGap.topicId)} />
                </div>
              ) : (
                <div className="dp-topic-detail-hint">
                  <p>
                    Если пробела нет, это ещё не значит, что тема освоена. Проверьте работу по этой
                    теме, чтобы узнать точно
                  </p>
                  {writeAccess.allowed && (
                    <Link className="dp-text" to={newWorkLink}>
                      <Plus size={14} aria-hidden="true" />
                      Создать ДЗ
                    </Link>
                  )}
                </div>
              )}
              {!!topic.prerequisites.length && (
                <div className="dp-topic-detail-block">
                  <h3>Базовые темы</h3>
                  <div className="dp-topic-detail-links">
                    {topic.prerequisites.map((id) => {
                      const status = statusOf(gapOf(id));
                      return (
                        <button key={id} onClick={() => selectTopic(id)}>
                          <span className={"dp-tone-" + status.tone}>
                            <status.Icon size={14} aria-hidden="true" />
                          </span>
                          {topicName(id)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </div>
        </Panel>
      )}
    </>
  );
}
