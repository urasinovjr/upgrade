import { taskTypes } from "../../data/catalog";
import type { HomeworkFile, HomeworkTask } from "../../domain/homework";
import { TopicSelect } from "../../shared/TopicSelect";
import { FormulaInput } from "../../shared/math";
import { ExamSelect } from "./ExamSelect";

export function HomeworkTaskEditor({
  task,
  files,
  change,
  remove,
  disabled,
}: {
  task: HomeworkTask;
  files: HomeworkFile[];
  change: (task: HomeworkTask) => void;
  remove: () => void;
  disabled: boolean;
}) {
  const update = (patch: Partial<HomeworkTask>) => change({ ...task, ...patch, confirmed: false });
  return (
    <section className="hw-task">
      <h2>{task.title}</h2>
      <fieldset disabled={disabled}>
        <label>
          Название задания
          <input
            value={task.title}
            maxLength={200}
            onChange={(event) => update({ title: event.target.value })}
          />
        </label>
        <label>
          Условие
          <textarea
            value={task.condition}
            maxLength={10000}
            rows={4}
            onChange={(event) => update({ condition: event.target.value })}
          />
        </label>
        <label>
          Формулы условия
          <FormulaInput
            label="Формулы условия"
            value={task.formula}
            onChange={(formula) => update({ formula })}
          />
        </label>
        <TopicSelect
          label="Тема знаний"
          value={task.topicId}
          onChange={(topicId) => update({ topicId })}
        />
        <label>
          Тип задачи
          <select
            value={task.taskTypeId}
            onChange={(event) => update({ taskTypeId: event.target.value })}
          >
            <option value="">Не указан</option>
            {taskTypes
              .filter((item) => item.inScope)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <ExamSelect value={task.exam} onChange={(exam) => update({ exam })} />
        {files.length > 0 && (
          <fieldset className="hw-options">
            <legend>Оригиналы и чертежи задания</legend>
            {files.map((file) => (
              <label key={file.id}>
                <input
                  type="checkbox"
                  checked={task.conditionFileIds.includes(file.id)}
                  onChange={(event) =>
                    update({
                      conditionFileIds: event.target.checked
                        ? [...task.conditionFileIds, file.id]
                        : task.conditionFileIds.filter((id) => id !== file.id),
                    })
                  }
                />
                {file.name}
              </label>
            ))}
          </fieldset>
        )}
        <div className="hw-actions">
          <label className="hw-check">
            <input
              type="checkbox"
              checked={task.confirmed}
              disabled={!task.condition.trim() && !task.formula.trim()}
              onChange={(event) => change({ ...task, confirmed: event.target.checked })}
            />
            Условие сверено с оригиналом
          </label>
          <button type="button" className="dp-text dp-danger-text" onClick={remove}>
            Удалить задание
          </button>
        </div>
      </fieldset>
    </section>
  );
}
