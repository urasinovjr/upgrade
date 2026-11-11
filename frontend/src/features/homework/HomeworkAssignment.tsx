import { Link } from "react-router";
import { gateway } from "../../data/gateway";
import { currentRevision } from "../../domain/review";
import { statusMeta } from "../../shared/status";
import { ErrorMessage } from "../../shared/ui";
import { SubmissionForm } from "./SubmissionForm";
import { type HomeworkEditorState } from "./useHomeworkEditor";
export function HomeworkAssignment({ context }: { context: HomeworkEditorState }) {
  const {
    homework,
    tasks,
    dirty,
    deadline,
    setDeadline,
    recipients,
    setRecipients,
    submitting,
    setSubmitting,
    client,
    navigate,
    store,
    access,
    frozen,
    stage,
    students,
    completed,
    change,
    writable,
    date,
  } = context;
  return (
    <>
      <section className="hw-assignment" hidden={stage !== "assign"}>
        <h2>{frozen ? "Назначения" : "Назначить ДЗ"}</h2>
        <label>
          Общий срок сдачи · необязательно
          <input
            type="datetime-local"
            value={deadline}
            disabled={!writable}
            onChange={(event) => setDeadline(event.target.value)}
          />
        </label>
        {frozen ? (
          <>
            <button
              disabled={!writable}
              onClick={() => change.mutate(() => gateway.homework.deadline(homework.id, date))}
            >
              Изменить срок
            </button>
            <ul className="hw-list">
              {homework.assignments.map((assignment) => {
                const attempts =
                  store.data?.works
                    .filter((work) => work.assignmentId === assignment.id)
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? [];
                const latest = attempts[0];
                return (
                  <li key={assignment.id}>
                    <div className="hw-assignment-row">
                      <div>
                        <strong>
                          {store.data?.students.find(
                            (student) => student.id === assignment.studentId,
                          )?.name ?? "Ученик"}
                        </strong>
                        {latest ? (
                          <>
                            <span>
                              Попытка {attempts.length} · {statusMeta[latest.status].label}
                              {latest.late ? " · С опозданием" : ""}
                            </span>
                            <Link to={"/works/" + latest.id}>
                              {currentRevision(latest) ? "Открыть результат" : "Открыть проверку"}
                            </Link>
                          </>
                        ) : (
                          <span>Ожидаем решение</span>
                        )}
                      </div>
                      <button
                        disabled={!writable || Boolean(latest && !currentRevision(latest))}
                        aria-expanded={submitting === assignment.id}
                        onClick={() =>
                          setSubmitting(submitting === assignment.id ? undefined : assignment.id)
                        }
                      >
                        {submitting === assignment.id ? "Скрыть загрузку" : "Загрузить за ученика"}
                      </button>
                    </div>
                    {submitting === assignment.id && (
                      <SubmissionForm
                        assignment={{ ...homework, id: assignment.id }}
                        writable={access.allowed}
                        onSubmit={(data, uploads) =>
                          gateway.homework.submit(assignment.id, data, uploads)
                        }
                        onSuccess={(work) => {
                          void client.invalidateQueries({ queryKey: ["store"] });
                          navigate("/works/" + work.id);
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <>
            <fieldset disabled={!writable} className="hw-options">
              <legend>Получатели</legend>
              {store.isPending && <p role="status">Загружаем учеников…</p>}
              <ErrorMessage error={store.error} />
              {!students.length && <Link to="/students">Добавить ученика</Link>}
              {students.map((student) => (
                <label key={student.id}>
                  <input
                    type="checkbox"
                    checked={recipients.includes(student.id)}
                    onChange={(event) =>
                      setRecipients(
                        event.target.checked
                          ? [...recipients, student.id]
                          : recipients.filter((id) => id !== student.id),
                      )
                    }
                  />
                  {student.name} · {student.grade} класс
                </label>
              ))}
            </fieldset>
            <p className="dp-caption">После назначения состав и условия фиксируются</p>
            {(dirty || !tasks.length || completed !== tasks.length || !recipients.length) && (
              <p role="status">
                {dirty
                  ? "Сохраните черновик перед назначением"
                  : !tasks.length
                    ? "Сначала добавьте задания"
                    : completed !== tasks.length
                      ? "Подтвердите все условия на шаге «Сверка»"
                      : "Выберите хотя бы одного ученика"}
              </p>
            )}
            <button
              className="dp-primary"
              disabled={
                !writable ||
                dirty ||
                !recipients.length ||
                !tasks.length ||
                completed !== tasks.length
              }
              onClick={() =>
                change.mutate(() =>
                  gateway.homework.assign(homework.id, recipients, date, homework.revision),
                )
              }
            >
              Назначить ученикам
            </button>
          </>
        )}
      </section>
    </>
  );
}
