import { useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { families, taskTypes } from "../../data/catalog";
import { TopicSelect } from "../../shared/TopicSelect";
import type { Attachment, ConditionRegion, GapProposal, Task } from "../../domain/models";
import { RectFields } from "../../shared/RectFields";
import { rectFromPercent, useRectFields, type PercentValues } from "../../shared/rectPercent";
import { FormulaInput } from "../../shared/math";
import { DialogKeyboard } from "./StepItem";

type Condition = Pick<
  Task,
  "condition" | "formula" | "reference" | "topicId" | "taskTypeId" | "conditionRegion"
>;
const startArea = { x: 0, y: 0, width: 1, height: 0.25 };

function pageOptions(files: Attachment[]) {
  return files.flatMap((file) =>
    file.pageOrder.map((page) => ({
      value: file.id + "#" + page,
      label: file.pages > 1 ? file.name + ", стр. " + page : file.name,
      fileId: file.id,
      page,
    })),
  );
}

function ConditionArea({
  files,
  value,
  onChange,
}: {
  files: Attachment[];
  value?: ConditionRegion;
  onChange: (value: ConditionRegion | undefined) => void;
}) {
  const options = pageOptions(files);
  const [values, setValues] = useRectFields(value?.region ?? startArea);
  const chosen = value ? value.fileId + "#" + value.page : "";
  const apply = (next: PercentValues, key = chosen) => {
    const option = options.find((item) => item.value === key);
    onChange(
      option && { fileId: option.fileId, page: option.page, region: rectFromPercent(next, 0.02) },
    );
  };
  return (
    <fieldset className="dp-condition-area">
      <legend>Условие на странице</legend>
      <p>Если условие записано на фото, укажите страницу и область, где оно стоит.</p>
      <label>
        Страница с условием
        <select value={chosen} onChange={(event) => apply(values, event.target.value)}>
          <option value="">Не указана</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {value && (
        <RectFields
          values={values}
          setValues={(update) => {
            const next = update(values);
            setValues(next);
            apply(next);
          }}
          minSize={0.02}
        />
      )}
    </fieldset>
  );
}

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
  files,
  removable,
  save,
  remove,
  close,
}: {
  task: Task;
  files: Attachment[];
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
    conditionRegion: task.conditionRegion,
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
      {files.length > 0 && (
        <ConditionArea
          files={files}
          value={draft.conditionRegion}
          onChange={(conditionRegion) => setDraft({ ...draft, conditionRegion })}
        />
      )}
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
