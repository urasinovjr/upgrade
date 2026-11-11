import { ArrowUpRight, Check, FileText, Map as MapIcon, RotateCcw, Target } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { topicById, topics, unknownTopicName } from "../../data/catalog";
import { gateway } from "../../data/gateway";
import { knowledgeFragment, studentTopicIds } from "../../domain/knowledgeFragment";
import type { Closure, StoreState, Student, StudentGap } from "../../domain/models";
import { deriveGaps } from "../../domain/review";
import { useCommand } from "../../shared/query";
import { useWriteAccess } from "../../shared/session";
import { wordForCount } from "../../shared/text";
import { changeContent } from "../../shared/ui/motion";
import { ClosureNote, GapHistory } from "./StudentPresentation";
import { buildMap, statusOf, topicName } from "./knowledge";
import "./knowledge.css";
import { evidenceLink, revealTop } from "./studentView";
import { useStudentView } from "./useStudentView";
export function useStudentDetail({ state, student }: { state: StoreState; student: Student }) {
  const command = useCommand();
  const writeAccess = useWriteAccess();
  const gaps = deriveGaps(state, student.id);
  const open = gaps.filter((gap) => !gap.closed);
  const closed = gaps.filter((gap) => gap.closed);
  const works = state.works
    .filter((work) => work.studentId === student.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const closures = state.closures.filter((item) => item.studentId === student.id);
  const dataIds = [...studentTopicIds(state, student.id)].sort().join(" ");
  const stripTopics = useMemo(() => knowledgeFragment(topics, dataIds.split(" ")), [dataIds]);
  const defaultTopic = open[0]?.topicId ?? gaps[0]?.topicId ?? stripTopics[0]?.id ?? topics[0].id;
  const view = useStudentView(defaultTopic);
  const { tab, topic: selected } = view;
  const map = useMemo(
    () =>
      tab === "map" ? buildMap(knowledgeFragment(topics, [...dataIds.split(" "), selected])) : null,
    [dataIds, selected, tab],
  );
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
        const nodes = page.current?.querySelectorAll<HTMLElement | SVGGElement>(
          ".dp-map-node.selected, .dp-map-level-node.selected",
        );
        const node = [...(nodes ?? [])].find((item) => item.getClientRects().length > 0);
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
    saveClosure(topicId, "reopen", "Пробел снова открыт", () => setFocusGap(topicId));

  const gapOf = (topicId: string) => gaps.find((gap) => gap.topicId === topicId);
  const selectedGap = gapOf(selected);
  const topic = topicById(selected) ?? {
    id: selected,
    name: unknownTopicName,
    description: "",
    prerequisites: [],
  };
  const selectedStatus = statusOf(selectedGap);
  const newWorkLink = "/homework?student=" + encodeURIComponent(student.id);
  const historyOf = (topicId: string) => closures.filter((item) => item.topicId === topicId);

  const evidence = (gap: StudentGap) => (
    <ul className="dp-evidence" aria-label="Основания пробела">
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
          disabled={command.isPending || !writeAccess.allowed}
          onClick={() => reopenGap(gap.topicId)}
        >
          <RotateCcw size={14} aria-hidden="true" />
          Открыть пробел снова
        </button>
      ) : (
        <button
          data-gap-action={gap.topicId}
          disabled={!writeAccess.allowed}
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
            <Title>{topicName(gap.topicId)}</Title>
            {next && (
              <span className="dp-student-next">
                <Target size={12} aria-hidden="true" />
                Повторить первым
              </span>
            )}
            <span className="dp-student-gap-meta">
              <span>{gap.closed ? "Пробел закрыт" : "Открытый пробел"}</span> ·{" "}
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

  return {
    state,
    student,
    command,
    writeAccess,
    gaps,
    open,
    closed,
    works,
    closures,
    dataIds,
    stripTopics,
    defaultTopic,
    view,
    tab,
    selected,
    map,
    editing,
    setEditing,
    page,
    detail,
    selectTopic,
    showOnMap,
    closing,
    setClosing,
    note,
    setNote,
    focusGap,
    setFocusGap,
    saveClosure,
    closeGap,
    cancelClose,
    reopenGap,
    gapOf,
    selectedGap,
    topic,
    selectedStatus,
    newWorkLink,
    historyOf,
    evidence,
    closure,
    gapItem,
  };
}
export type StudentDetailState = ReturnType<typeof useStudentDetail>;
