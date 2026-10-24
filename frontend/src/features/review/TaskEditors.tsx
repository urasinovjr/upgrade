import { useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { families, taskTypes } from "../../data/catalog";
import { TopicSelect } from "../../shared/TopicSelect";
import type { GapProposal, Task } from "../../domain/models";
import { FormulaInput } from "../../shared/math";
import { DialogKeyboard } from "./StepItem";

type Condition = Pick<Task, "condition" | "formula" | "reference" | "topicId" | "taskTypeId">;

function TaskTypeSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const groups = [
    ...families.map((family) => ({
      label: family.name,
      items: taskTypes.filter((item) => item.inScope && item.family === family.id),
    })),
    { label: "Вне охвата", items: taskTypes.filter((item) => !item.inScope) },
  ];
  return (
    <label>
      Тип задачи
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Не указан</option>
        {groups
          .filter((group) => group.items.length)
          .map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.inScope ? item.name : item.name + " · вне охвата"}
                </option>
              ))}
            </optgroup>
          ))}
      </select>
    </label>
  );
}

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
    taskTypeId: task.taskTypeId,
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
      <TopicSelect
        label="Тема задачи"
        value={draft.topicId}
        onChange={(topicId) => setDraft({ ...draft, topicId })}
      />
      <TaskTypeSelect
        value={draft.taskTypeId ?? ""}
        onChange={(taskTypeId) => setDraft({ ...draft, taskTypeId })}
      />
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
      <TopicSelect
        label="Тема"
        value={draft.topicId}
        onChange={(topicId) => setDraft({ ...draft, topicId })}
      />
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
