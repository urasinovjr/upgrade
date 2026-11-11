import * as Tabs from "@radix-ui/react-tabs";
import {
  Check,
  FileText,
  ListChecks,
  PauseCircle,
  PenLine,
  Pencil,
  PencilLine,
} from "lucide-react";
import { useId, type KeyboardEvent } from "react";
import { topicById } from "../../data/catalog";
import type { GapDecision, GapProposal, Task } from "../../domain/models";
import { MixedText } from "../../shared/math";
import "../homework/homework.css";
import "./review.css";
import { taskIssues, taskState } from "./reviewView";
export function TaskLabel({ task }: { task: Task }) {
  const { errors, unclear } = taskIssues(task);
  const done = task.reviewed || task.omitted;
  const count = errors || unclear;
  const countTone = errors ? "danger" : "warning";
  return (
    <>
      <span className={"dp-task-state" + (done ? " is-reviewed" : "")} aria-hidden="true">
        {task.omitted ? <PauseCircle size={12} /> : task.reviewed && <Check size={12} />}
      </span>
      {task.title}
      {count > 0 && (
        <span className={"dp-task-count dp-tone-" + countTone} aria-hidden="true">
          {count}
        </span>
      )}
    </>
  );
}

export function TaskTab({ task }: { task: Task }) {
  const describe = useId();
  return (
    <>
      <Tabs.Trigger value={task.id} aria-describedby={describe}>
        <TaskLabel task={task} />
      </Tabs.Trigger>
      <span id={describe} className="dp-visually-hidden">
        {taskState(task)}
      </span>
    </>
  );
}

const gapNotes: Record<GapDecision, { editable: string; readOnly: string }> = {
  confirmed: {
    editable: "Пробел попадёт в карту знаний, когда вы опубликуете результат",
    readOnly: "Гипотеза подтверждена",
  },
  rejected: {
    editable: "Гипотеза останется в истории и не попадёт в карту знаний",
    readOnly: "Гипотеза отклонена",
  },
  hypothesis: {
    editable: "Пока вы не решите, гипотеза не попадает в карту знаний",
    readOnly: "Гипотеза не попала в карту знаний",
  },
};

export function GapSection({
  gap,
  editable,
  busy,
  onChange,
  onEdit,
}: {
  gap: GapProposal;
  editable: boolean;
  busy: boolean;
  onChange: (gap: GapProposal) => void;
  onEdit: () => void;
}) {
  const topic = topicById(gap.topicId);
  const toggle = (decision: "confirmed" | "rejected") =>
    onChange({ ...gap, decision: gap.decision === decision ? "hypothesis" : decision });
  return (
    <section className="dp-gap-proposal" data-decision={gap.decision}>
      <h3>
        {gap.decision === "confirmed" ? (
          <PenLine size={14} aria-hidden="true" />
        ) : (
          <PencilLine size={14} aria-hidden="true" />
        )}
        {gap.decision === "confirmed" ? "Пробел" : "Гипотеза о пробеле"} ·{" "}
        {topic?.name ?? "Тема не найдена"}
      </h3>
      <p className={gap.reason.trim() ? undefined : "dp-gap-empty"}>
        <MixedText value={gap.reason.trim() || "Укажите, что повторить"} />
      </p>
      {editable ? (
        <>
          <div className="dp-inline-actions">
            <button
              className="dp-gap-confirm"
              aria-pressed={gap.decision === "confirmed"}
              disabled={busy}
              onClick={() => toggle("confirmed")}
            >
              <Check size={14} />
              {gap.decision === "confirmed" ? "Пробел подтверждён" : "Подтвердить гипотезу"}
            </button>
            <button
              className="dp-text"
              aria-pressed={gap.decision === "rejected"}
              disabled={busy}
              onClick={() => toggle("rejected")}
            >
              {gap.decision === "rejected" ? "Гипотеза отклонена" : "Отклонить"}
            </button>
            <button
              className="dp-text dp-gap-edit"
              disabled={busy}
              aria-label="Изменить гипотезу о пробеле"
              onClick={onEdit}
            >
              <Pencil size={14} />
              <span>Изменить</span>
            </button>
          </div>
          <span className="dp-caption">{gapNotes[gap.decision].editable}</span>
        </>
      ) : (
        <span className="dp-caption">{gapNotes[gap.decision].readOnly}</span>
      )}
    </section>
  );
}

export type Pane = "analysis" | "original";
const panes: { value: Pane; label: string; Icon: typeof FileText }[] = [
  { value: "analysis", label: "Разбор", Icon: ListChecks },
  { value: "original", label: "Оригинал", Icon: FileText },
];
export function PaneSwitch({
  pane,
  controls,
  onChange,
}: {
  pane: Pane;
  controls: Record<Pane, string>;
  onChange: (pane: Pane) => void;
}) {
  const move = (event: KeyboardEvent) => {
    const other: Pane = pane === "analysis" ? "original" : "analysis";
    const keys: Record<string, Pane | undefined> = {
      ArrowLeft: other,
      ArrowRight: other,
      Home: "analysis",
      End: "original",
    };
    const target = keys[event.key];
    if (!target) return;
    event.preventDefault();
    onChange(target);
  };
  return (
    <div className="dp-mobile-panes dp-segmented" role="tablist" aria-label="Разбор работы">
      {panes.map(({ value, label, Icon }) => (
        <button
          key={value}
          role="tab"
          aria-selected={pane === value}
          aria-controls={controls[value]}
          tabIndex={pane === value ? 0 : -1}
          onKeyDown={move}
          onClick={() => onChange(value)}
        >
          <Icon size={16} aria-hidden="true" />
          <span className="dp-pane-label">{label}</span>
        </button>
      ))}
    </div>
  );
}
