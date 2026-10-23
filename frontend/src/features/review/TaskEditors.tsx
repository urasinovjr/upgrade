import { useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { topics } from "../../data/fixtures";
import type { GapProposal, Task } from "../../domain/models";
import { FormulaInput } from "../../shared/math";
import { DialogKeyboard } from "./StepItem";

type Condition = Pick<Task, "condition" | "formula" | "reference" | "topicId">;

export function ConditionEditor({
  task,
  removable,
  save,
  remove,
  close,
}: {
  task: Task;
  removable: boolean;
  save: (value: Condition) => void;
  remove: () => void;
  close: () => void;
}) {
  const [draft, setDraft] = useState<Condition>({
    condition: task.condition,
    formula: task.formula,
    reference: task.reference,
    topicId: task.topicId,
  });
  return (
    <form
      className="dp-editor-form"
      onSubmit={(event) => {
        event.preventDefault();
        save(draft);
      }}
    >
      <label>
        Условие
        <textarea
          value={draft.condition}
          onChange={(event) => setDraft({ ...draft, condition: event.target.value })}
        />
      </label>
      <label>
        Формула условия
        <FormulaInput
          label="Формула условия"
          value={draft.formula}
          onChange={(formula) => setDraft({ ...draft, formula })}
        />
      </label>
      <label>
        Правильный ответ
        <FormulaInput
          label="Правильный ответ"
          value={draft.reference}
          onChange={(reference) => setDraft({ ...draft, reference })}
        />
      </label>
      <label>
        Тема задачи
        <select
          value={draft.topicId}
          onChange={(event) => setDraft({ ...draft, topicId: event.target.value })}
        >
          {topics.map((topic) => (
            <option value={topic.id} key={topic.id}>
              {topic.name}
            </option>
          ))}
        </select>
      </label>
      <DialogKeyboard />
      <div className="dp-dialog-actions">
        {removable && (
          <button
            type="button"
            className="dp-text dp-danger-text dp-editor-remove"
            onClick={remove}
          >
            <Trash2 size={14} />
            Удалить задачу
          </button>
        )}
        <button type="button" onClick={close}>
          Отмена
        </button>
        <button className="dp-primary">
          <Check size={16} />
          Сохранить
        </button>
      </div>
    </form>
  );
}

export function GapEditor({
  gap,
  save,
  close,
}: {
  gap: GapProposal;
  save: (gap: GapProposal) => void;
  close: () => void;
}) {
  const [draft, setDraft] = useState(gap);
  return (
    <form
      className="dp-editor-form"
      onSubmit={(event) => {
        event.preventDefault();
        save(draft);
      }}
    >
      <label>
        Тема
        <select
          value={draft.topicId}
          onChange={(event) => setDraft({ ...draft, topicId: event.target.value })}
        >
          {topics.map((topic) => (
            <option value={topic.id} key={topic.id}>
              {topic.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Что повторить
        <textarea
          value={draft.reason}
          placeholder="Например, ограничения знаменателя при сокращении дробей"
          onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
        />
      </label>
      <div className="dp-dialog-actions">
        <button type="button" onClick={close}>
          Отмена
        </button>
        <button className="dp-primary">
          <Check size={16} />
          Сохранить
        </button>
      </div>
    </form>
  );
}
