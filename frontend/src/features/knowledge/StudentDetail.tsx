import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowUpRight,
  Check,
  CircleHelp,
  FileText,
  Map as MapIcon,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type { Closure, Evidence, StoreState, Student, StudentGap } from "../../domain/models";
import { currentRevision, deriveGaps } from "../../domain/review";
import { topics } from "../../data/fixtures";
import { gateway } from "../../data/gateway";
import { useCommand, useStore } from "../../shared/query";
import { statusMeta } from "../../shared/status";
import { date, wordForCount } from "../../shared/text";
import {
  Avatar,
  Disclosure,
  ErrorMessage,
  Modal,
  PageBar,
  PageLoading,
  PageState,
  Panel,
  TabSet,
} from "../../shared/ui";
import { changeContent } from "../../shared/ui/motion";
import { StudentForm } from "../students/StudentForm";
import { KnowledgeMap, MapLegend } from "./KnowledgeMap";
import { Timeline } from "./Timeline";
import {
  closureTitle,
  dateTime,
  reducedMotion,
  statusOf,
  topicName,
  topicOrder,
} from "./knowledge";
import { studentTabs, useStudentView, type StudentTab } from "./useStudentView";
import "./knowledge.css";
import { StudentActions } from "../students/StudentActions";

const recentLimit = 6;

function revealTop(element: HTMLElement, amount: number) {
  let scroller: HTMLElement | null = element.parentElement;
  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY))
    scroller = scroller.parentElement;
  const target = scroller ?? document.scrollingElement ?? document.documentElement;
  const bottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
  const box = element.getBoundingClientRect();
  const overflow = box.top + Math.min(box.height, amount) - bottom + 16;
  if (overflow > 0)
    target.scrollBy({ top: overflow, behavior: reducedMotion() ? "auto" : "smooth" });
}

function evidenceLink(state: StoreState, item: Evidence) {
  const work = state.works.find((entry) => entry.id === item.workId);
  if (work && !work.editing && work.currentPublishedId === item.revisionId)
    return {
      to: "/works/" + item.workId + "?task=" + encodeURIComponent(item.taskId),
      label: "подтверждённая редакция",
    };
  const number = work?.published.find((revision) => revision.id === item.revisionId)?.number;
  return {
    to: "/works/" + item.workId + "/report?revision=" + item.revisionId,
    label: number ? "отчёт · редакция " + number : "отчёт",
  };
}

function GapHistory({ events }: { events: Closure[] }) {
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

function ClosureNote({ closure }: { closure: Closure }) {
  return (
    <>
      {closure.note && <blockquote className="dp-closure-note">{closure.note}</blockquote>}
      <p className="dp-closure-date">
        Закрыт <time dateTime={closure.at}>{dateTime.format(new Date(closure.at))}</time>
      </p>
    </>
  );
}

function StudentPage({ state, student }: { state: StoreState; student: Student }) {
  const command = useCommand();
  const gaps = deriveGaps(state, student.id);
  const open = gaps.filter((gap) => !gap.closed);
  const closed = gaps.filter((gap) => gap.closed);
  const works = state.works
    .filter((work) => work.studentId === student.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const closures = state.closures.filter((item) => item.studentId === student.id);
  const defaultTopic = open[0]?.topicId ?? gaps[0]?.topicId ?? topics[0].id;
  const view = useStudentView(defaultTopic);
  const { tab, topic: selected } = view;
  const [editing, setEditing] = useState(false);
  const page = useRef<HTMLDivElement>(null);
  const detail = useRef<HTMLElement>(null);

  const selectTopic = (id: string) => {
    view.writeTopic(id);
    void changeContent(detail.current, () => view.setTopic(id)).then(() => {
      const element = detail.current;
      if (element) revealTop(element, 320);
    });
  };
  const showOnMap = (id: string) => {
    const content = page.current?.querySelector<HTMLElement>(".dp-tab-content") ?? null;
    void changeContent(content, () => view.openMap(id)).then(() => {
      let frames = 0;
      const focus = () => {
        const node = page.current?.querySelector<SVGGElement>(".dp-map-node.selected");
        if (node) {
          node.focus();
          return;
        }
        frames += 1;
        if (frames < 10) requestAnimationFrame(focus);
      };
      requestAnimationFrame(focus);
    });
  };

  const [closing, setClosing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [focusGap, setFocusGap] = useState<string | null>(null);
  useEffect(() => {
    if (!focusGap) return;
    let frame = 0;
    let timer = 0;
    const focus = () => {
      page.current
        ?.querySelector<HTMLElement>(`[data-gap-action="${CSS.escape(focusGap)}"]`)
        ?.focus({ preventScroll: false });
      setFocusGap(null);
    };
    const wait = () => {
      if (document.querySelector(".dp-dialog")) frame = requestAnimationFrame(wait);
      else timer = window.setTimeout(focus);
    };
    wait();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [focusGap]);
  const saveClosure = (
    topicId: string,
    action: Closure["action"],
    closureNote: string,
    onSuccess: () => void,
  ) =>
    command.mutate(
      () =>
        gateway.closure({
          studentId: student.id,
          topicId,
          note: closureNote,
          at: new Date().toISOString(),
          action,
        }),
      { onSuccess },
    );
  const closeGap = (topicId: string) =>
    saveClosure(topicId, "close", note.trim(), () => {
      setClosing(null);
      setFocusGap(topicId);
    });
  const cancelClose = () => {
    setClosing(null);
    command.reset();
  };
  const reopenGap = (topicId: string) =>
    saveClosure(topicId, "reopen", "Пробел вновь требует внимания.", () => setFocusGap(topicId));

  const gapOf = (topicId: string) => gaps.find((gap) => gap.topicId === topicId);
  const selectedGap = gapOf(selected);
  const topic = topics.find((item) => item.id === selected)!;
  const selectedStatus = statusOf(selectedGap);
  const newWorkLink = "/works/new?student=" + encodeURIComponent(student.id);
  const historyOf = (topicId: string) => closures.filter((item) => item.topicId === topicId);

  const evidence = (gap: StudentGap) => (
    <ul className="dp-evidence" aria-label="Основания">
      {gap.evidence.map((item) => {
        const link = evidenceLink(state, item);
        return (
          <li key={item.workId + "-" + item.taskId}>
            <Link to={link.to}>
              <FileText size={14} aria-hidden="true" />
              <span>{item.title}</span>
              <small>{link.label}</small>
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
  const closure = (gap: StudentGap, extra?: ReactNode) => (
    <div className="dp-student-gap-actions">
      {gap.closed ? (
        <button
          data-gap-action={gap.topicId}
          disabled={command.isPending}
          onClick={() => reopenGap(gap.topicId)}
        >
          <RotateCcw size={14} aria-hidden="true" />
          Открыть пробел снова
        </button>
      ) : (
        <button
          data-gap-action={gap.topicId}
          onClick={() => {
            command.reset();
            setNote("");
            setClosing(gap.topicId);
          }}
        >
          <Check size={14} aria-hidden="true" />
          Закрыть пробел
        </button>
      )}
      {extra}
    </div>
  );
  const gapItem = (gap: StudentGap, next: boolean) => {
    const status = statusOf(gap);
    const Title = gap.closed ? "h4" : "h3";
    return (
      <li
        key={gap.topicId}
        className={"dp-student-gap" + (gap.closed ? " is-closed" : "") + (next ? " is-next" : "")}
      >
        <span className={"dp-student-gap-icon dp-tone-" + status.tone}>
          <status.Icon size={16} aria-hidden="true" />
        </span>
        <div className="dp-student-gap-body">
          <div className="dp-student-gap-title">
            <Title>
              {gap.closed ? topicName(gap.topicId) : "Повторить: " + topicName(gap.topicId)}
            </Title>
            {next && (
              <span className="dp-student-next">
                <Sparkles size={12} aria-hidden="true" />
                Следующий шаг
              </span>
            )}
            <span className="dp-student-gap-meta">
              <span>{gap.closed ? "Пробел закрыт" : "Подтверждённый пробел"}</span> ·{" "}
              {gap.evidence.length}{" "}
              {wordForCount(gap.evidence.length, ["основание", "основания", "оснований"])}
            </span>
          </div>
          <p>{gap.reason}</p>
          {gap.closed && gap.closure && <ClosureNote closure={gap.closure} />}
          {evidence(gap)}
          {closure(
            gap,
            <button className="dp-text" onClick={() => showOnMap(gap.topicId)}>
              <MapIcon size={14} aria-hidden="true" />
              Открыть на карте
            </button>,
          )}
          <GapHistory events={historyOf(gap.topicId)} />
        </div>
      </li>
    );
  };

  return (
    <div ref={page} className="dp-page dp-student-page">
      <PageBar
        trail={<span>{student.name}</span>}
        actions={
          <>
            <button
              className="dp-compact-action"
              aria-label="Редактировать ученика"
              onClick={() => setEditing(true)}
            >
              <Pencil size={14} aria-hidden="true" />
              <span>Редактировать</span>
            </button>
            <StudentActions student={student} />
          </>
        }
      />
      <header className="dp-student-head student-header">
        <Avatar student={student} />
        <div className="dp-student-id">
          <h1>{student.name}</h1>
          <p>
            {student.grade} класс · {student.goal || "цель занятий пока не указана"}
          </p>
        </div>
        <p className="dp-student-stats">
          <span>
            <strong>{works.length}</strong>{" "}
            {wordForCount(works.length, ["работа", "работы", "работ"])}
          </span>
          <span>
            <strong>{open.length}</strong>{" "}
            {wordForCount(open.length, [
              "тема для повторения",
              "темы для повторения",
              "тем для повторения",
            ])}
          </span>
          <span>
            <strong>{closed.length}</strong>{" "}
            {wordForCount(closed.length, [
              "закрытый пробел",
              "закрытых пробела",
              "закрытых пробелов",
            ])}
          </span>
        </p>
      </header>
      <TabSet
        label="Разделы карточки"
        value={tab}
        onChange={(next) => view.changeTab(next as StudentTab)}
        items={studentTabs}
      >
        {tab === "overview" && (
          <>
            <section className="dp-student-topics" aria-labelledby="student-topics-title">
              <h2 id="student-topics-title">Темы</h2>
              <ul>
                {topicOrder.map((item) => {
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
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
            <ErrorMessage error={!closing && command.error} />
            <div className="dp-student-grid">
              <section className="dp-student-section" aria-labelledby="student-gaps-title">
                <div className="dp-student-heading">
                  <h2 id="student-gaps-title">
                    Темы для повторения
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
                      Новая проверенная работа поможет уточнить, какие темы требуют внимания.
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
                  <Link className="dp-text" to={newWorkLink}>
                    <Plus size={14} aria-hidden="true" />
                    Новая работа
                  </Link>
                </div>
                {works.length ? (
                  <ul className="dp-student-works">
                    {works.slice(0, recentLimit).map((work) => {
                      const { label, tone, Icon } = statusMeta[work.status];
                      const current = currentRevision(work);
                      return (
                        <li key={work.id}>
                          <Link className="dp-student-work" to={"/works/" + work.id}>
                            <span
                              className={"dp-student-work-status dp-tone-" + tone}
                              title={label}
                            >
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
                              Отчёт · v{current.number}
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
                    <p>Работ пока нет.</p>
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
        {tab === "map" && (
          <Panel
            className="dp-student-map"
            title="Карта знаний"
            summary={topic.name}
            onClose={() => view.changeTab("overview")}
          >
            <div className="dp-map-layout">
              <section className="dp-map-canvas" aria-label="Связи тем">
                <KnowledgeMap gaps={gaps} selected={selected} onSelect={selectTopic} />
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
                      Отсутствие пробела ещё не означает, что тема освоена. Проверенная работа по
                      теме покажет, есть ли пробел.
                    </p>
                    <Link className="dp-text" to={newWorkLink}>
                      <Plus size={14} aria-hidden="true" />
                      Новая работа
                    </Link>
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
        {tab === "history" && (
          <section className="dp-student-section" aria-labelledby="student-history-title">
            <h2 id="student-history-title" className="dp-visually-hidden">
              История
            </h2>
            <Timeline works={works} closures={closures} onOpenTopic={showOnMap} />
          </section>
        )}
      </TabSet>
      <StudentForm student={student} open={editing} onClose={() => setEditing(false)} />
      <Modal
        open={!!closing}
        onOpenChange={(value) => {
          if (!value) cancelClose();
        }}
        title="Закрыть пробел"
        description="Зафиксируйте, на основании чего вы считаете пробел закрытым. Это останется в истории."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (closing && note.trim()) closeGap(closing);
          }}
        >
          <label>
            Основание закрытия
            <textarea
              required
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Например, ученик самостоятельно решил три похожие задачи."
            />
          </label>
          <ErrorMessage error={command.error} />
          <div className="dp-dialog-actions">
            <button type="button" onClick={cancelClose}>
              Отмена
            </button>
            <button className="dp-primary" disabled={!note.trim() || command.isPending}>
              <Check size={16} aria-hidden="true" />
              Подтвердить закрытие
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function StudentDetail() {
  const { id } = useParams();
  const query = useStore();
  if (query.isPending) return <PageLoading variant="student" />;
  if (!query.data)
    return <PageState title="Ученик" error={query.error} retry={() => void query.refetch()} />;
  const student = query.data.students.find((item) => item.id === id);
  if (!student)
    return (
      <PageState
        title="Ученик не найден"
        description="Проверьте ссылку или выберите ученика из списка."
        to="/students"
        linkLabel="К ученикам"
      />
    );
  return <StudentPage key={student.id} state={query.data} student={student} />;
}
