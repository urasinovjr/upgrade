import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, Link2Off, LocateFixed, Pencil, Trash2 } from "lucide-react";
import type { Step, Verdict } from "../../domain/models";
import { fromOriginal } from "../../domain/stepOrigin";
import { Formula, FormulaInput, MixedText } from "../../shared/math";
import { verdictMeta } from "../../shared/status";

const verdicts: { value: Verdict; label: string }[] = [
  { value: "correct", label: "Верно" },
  { value: "error", label: "Ошибка" },
  { value: "uncertain", label: "Неясно" },
];

export function DialogKeyboard() {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.mathVirtualKeyboard.container = container.current;
    return () => {
      window.mathVirtualKeyboard.hide();
      window.mathVirtualKeyboard.container = document.body;
    };
  }, []);
  return <div className="dp-formula-keyboard" ref={container} />;
}

function VerdictSwitch({
  step,
  index,
  disabled,
  onChange,
}: {
  step: Step;
  index: number;
  disabled: boolean;
  onChange: (verdict: Verdict) => void;
}) {
  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    const offset = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!offset) return;
    event.preventDefault();
    const items = [...event.currentTarget.parentElement!.querySelectorAll("button")];
    const current = items.indexOf(event.currentTarget);
    items[(current + offset + items.length) % items.length].focus();
  };
  return (
    <div className="dp-verdict-switch" role="radiogroup" aria-label={"Вердикт шага " + index}>
      {verdicts.map((item) => {
        const checked = step.verdict === item.value;
        return (
          <button
            key={item.value}
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={"dp-verdict-" + item.value}
            disabled={disabled}
            onKeyDown={move}
            onClick={() => {
              if (!checked) onChange(item.value);
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function OriginTools({
  step,
  index,
  editable,
  disabled,
  onShow,
  onUnlink,
}: {
  step: Step;
  index: number;
  editable: boolean;
  disabled: boolean;
  onShow: () => void;
  onUnlink: () => void;
}) {
  return (
    <div className="dp-step-origin">
      {!step.origin && <span className="dp-step-origin-note">Нет привязки к странице</span>}
      {step.origin && !fromOriginal(step) && (
        <span className="dp-step-origin-note">Запись изменена после распознавания</span>
      )}
      {step.origin && (
        <>
          <button
            className="dp-text"
            onClick={onShow}
            aria-label={"Показать шаг " + index + " в оригинале"}
          >
            <LocateFixed size={14} aria-hidden="true" />
            Показать в оригинале
          </button>
          {editable && (
            <button
              className="dp-text"
              onClick={onUnlink}
              disabled={disabled}
              aria-label={"Отвязать шаг " + index + " от оригинала"}
            >
              <Link2Off size={14} aria-hidden="true" />
              Отвязать от оригинала
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function StepItem({
  step,
  index,
  editable,
  disabled,
  onVerdict,
  onEdit,
  onShow,
  onUnlink,
}: {
  step: Step;
  index: number;
  editable: boolean;
  disabled: boolean;
  onVerdict: (verdict: Verdict) => void;
  onEdit: () => void;
  onShow: () => void;
  onUnlink: () => void;
}) {
  const origin = (
    <OriginTools
      step={step}
      index={index}
      editable={editable}
      disabled={disabled}
      onShow={onShow}
      onUnlink={onUnlink}
    />
  );
  const [open, setOpen] = useState(false);
  const detail = useId();
  const root = useRef<HTMLElement>(null);
  const changed = useRef(false);
  useEffect(() => {
    if (!changed.current) return;
    changed.current = false;
    root.current
      ?.querySelector<HTMLElement>(".dp-verdict-switch [aria-checked=true]")
      ?.focus({ preventScroll: true });
  }, [step.verdict]);
  const tools = editable && (
    <div className="dp-step-tools step-top">
      <VerdictSwitch
        step={step}
        index={index}
        disabled={disabled}
        onChange={(verdict) => {
          changed.current = true;
          onVerdict(verdict);
        }}
      />
      <button
        className="dp-step-edit"
        onClick={onEdit}
        disabled={disabled}
        aria-label={"Изменить шаг " + index}
      >
        <Pencil size={14} />
        <span>Изменить</span>
      </button>
    </div>
  );
  const formula = step.latex.trim() ? (
    <Formula value={step.latex} />
  ) : (
    <span className="dp-step-empty">Запись не распознана</span>
  );
  if (step.verdict === "correct")
    return (
      <article ref={root} className="dp-step dp-step-correct" data-open={open}>
        <button
          className="dp-step-toggle"
          aria-expanded={open}
          aria-controls={detail}
          onClick={() => setOpen(!open)}
        >
          <span className="dp-step-number">{index}</span>
          <span className="dp-step-formula">{formula}</span>
          <Check className="dp-step-check" size={16} aria-hidden="true" />
          <span className="dp-visually-hidden">Верно, показать объяснение</span>
        </button>
        {tools}
        {origin}
        <div className="dp-step-detail" inert={!open} aria-hidden={!open}>
          <div id={detail}>
            <p>
              <MixedText value={step.explanation || "Объяснения нет"} />
            </p>
          </div>
        </div>
      </article>
    );
  const { label, Icon } = verdictMeta[step.verdict];
  const hasExplanation = Boolean(step.explanation.trim());
  const explanationPrompt =
    step.verdict === "error"
      ? "Объясните, в чём ошибка"
      : "Сверьте запись с оригиналом и уточните этот шаг";
  return (
    <article ref={root} className={"dp-step dp-step-card dp-step-" + step.verdict}>
      <div className="dp-step-heading">
        <span className="dp-step-number">{index}</span>
        <strong>
          <Icon size={14} aria-hidden="true" />
          {label}
        </strong>
      </div>
      {tools}
      <div className="dp-step-formula">{formula}</div>
      <p className={"dp-step-explanation" + (hasExplanation ? "" : " is-empty")}>
        <MixedText value={hasExplanation ? step.explanation : explanationPrompt} />
      </p>
      {origin}
    </article>
  );
}

export function StepEditor({
  step,
  preset,
  index,
  explain,
  removable,
  save,
  remove,
  close,
}: {
  step: Step;
  preset?: Partial<Step>;
  index: number;
  explain?: boolean;
  removable: boolean;
  save: (step: Step) => void;
  remove: () => void;
  close: () => void;
}) {
  const [draft, setDraft] = useState({ ...step, ...preset });
  const explanation = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!explain) return;
    const frame = requestAnimationFrame(() => explanation.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [explain]);
  return (
    <form
      className="dp-editor-form"
      onSubmit={(event) => {
        event.preventDefault();
        save(draft);
      }}
    >
      <label>
        Формула
        <FormulaInput
          label={"Формула шага " + index}
          value={draft.latex}
          onChange={(latex) => setDraft({ ...draft, latex })}
        />
      </label>
      <DialogKeyboard />
      <label>
        Вердикт
        <select
          value={draft.verdict}
          onChange={(event) => setDraft({ ...draft, verdict: event.target.value as Verdict })}
        >
          {(Object.keys(verdictMeta) as Verdict[]).map((verdict) => (
            <option key={verdict} value={verdict}>
              {verdictMeta[verdict].label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Объяснение
        <textarea
          ref={explanation}
          value={draft.explanation}
          placeholder={draft.verdict === "error" ? "В чём ошибка и как её исправить" : undefined}
          onChange={(event) => setDraft({ ...draft, explanation: event.target.value })}
        />
      </label>
      <div className="dp-dialog-actions">
        {removable && (
          <button
            type="button"
            className="dp-text dp-danger-text dp-editor-remove"
            onClick={remove}
          >
            <Trash2 size={14} />
            Удалить шаг
          </button>
        )}
        <button type="button" onClick={close}>
          Отмена
        </button>
        <button
          className="dp-primary"
          disabled={!draft.latex.trim() || (draft.verdict === "error" && !draft.explanation.trim())}
        >
          <Check size={16} />
          Сохранить шаг
        </button>
      </div>
    </form>
  );
}
