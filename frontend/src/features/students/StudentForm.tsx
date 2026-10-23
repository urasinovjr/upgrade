import { useState } from "react";
import { gateway } from "../../data/gateway";
import type { Student } from "../../domain/models";
import { useCommand } from "../../shared/query";
import { ErrorMessage, Modal } from "../../shared/ui";

export function StudentForm({
  student,
  open,
  onClose,
  onSaved,
}: {
  student?: Student;
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
      title={student ? "Редактировать ученика" : "Новый ученик"}
      description="Имя видно только в вашем кабинете."
    >
      <Form
        key={student?.id || String(open)}
        student={student}
        onClose={onClose}
        onSaved={onSaved}
      />
    </Modal>
  );
}
function Form({
  student,
  onClose,
  onSaved,
}: {
  student?: Student;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const [name, setName] = useState(student?.name || "");
  const [grade, setGrade] = useState(student?.grade || 10);
  const [goal, setGoal] = useState(student?.goal || "");
  const command = useCommand();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const id = student?.id || crypto.randomUUID();
        command.mutate(
          () =>
            gateway.student({
              id,
              name: name.trim(),
              grade,
              goal,
              color: student?.color || "teal",
            }),
          {
            onSuccess: () => {
              onSaved?.(id);
              onClose();
            },
          },
        );
      }}
    >
      <label>
        Имя ученика
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
        />
      </label>
      <label>
        Класс
        <select value={grade} onChange={(event) => setGrade(Number(event.target.value))}>
          {[9, 10, 11].map((value) => (
            <option key={value} value={value}>
              {value} класс
            </option>
          ))}
        </select>
      </label>
      <label>
        Цель занятий
        <textarea
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="Например, подготовка к ЕГЭ"
        />
      </label>
      <ErrorMessage error={command.error} />
      <div className="dp-dialog-actions">
        <button type="button" onClick={onClose}>
          Отмена
        </button>
        <button className="dp-primary" disabled={command.isPending}>
          {command.isPending ? "Сохраняем…" : "Сохранить ученика"}
        </button>
      </div>
    </form>
  );
}
