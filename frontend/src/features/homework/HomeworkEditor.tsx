import { Link } from "react-router";
import { serverMode } from "../../data/gateway";
import type { Homework } from "../../domain/homework";
import { ErrorMessage, Modal } from "../../shared/ui";
import { HomeworkAssignment } from "./HomeworkAssignment";
import { HomeworkPreparation } from "./HomeworkPreparation";
import { HomeworkPreview } from "./HomeworkPreview";
import { useHomeworkEditor } from "./useHomeworkEditor";
export function HomeworkEditor({ homework }: { homework: Homework }) {
  const context = useHomeworkEditor({ homework });
  const {
    title,
    setTitle,
    dirty,
    draft,
    frozen,
    writable,
    copy,
    save,
    change,
    recognize,
    job,
    upload,
    busy,
    stage,
    goStage,
    saveDraft,
  } = context;

  return (
    <div className="hw-page">
      <Link to="/homework" className="dp-text">
        Все ДЗ
      </Link>
      <header className="hw-heading">
        <div>
          <h1>{homework.title}</h1>
          <p className="dp-caption">
            {frozen
              ? "Условия зафиксированы. Исправления можно внести в копию"
              : "Сверьте каждое условие и чертёж перед назначением"}
          </p>
        </div>
        {frozen ? (
          <button disabled={!writable || copy.isPending} onClick={() => copy.mutate()}>
            Создать копию
          </button>
        ) : (
          <button className="dp-primary" disabled={!writable || !title.trim()} onClick={save}>
            {change.isPending ? "Сохраняем…" : "Сохранить черновик"}
          </button>
        )}
      </header>
      {!serverMode && (
        <p className="hw-test-mode">Распознавание и отработка в демо показаны на примерах</p>
      )}
      <ErrorMessage
        error={change.error || copy.error || recognize.error || job.error || upload.error}
      />
      {draft.recoveryError && <p role="alert">{draft.recoveryError}</p>}
      {!frozen && draft.revision !== homework.revision && !busy && (
        <div role="status" className="hw-test-mode">
          <p>
            ДЗ изменилось в другой вкладке. Текущие правки сохранены на этом устройстве. Скопируйте
            нужный текст перед загрузкой сохранённой версии
          </p>
          <button onClick={() => draft.saved(homework)}>Загрузить сохранённую версию</button>
        </div>
      )}
      {!frozen && (
        <nav className="hw-stages" aria-label="Подготовка ДЗ">
          {[
            ["source", "Условия"],
            ["review", "Сверка"],
            ["assign", "Назначение"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-current={stage === value ? "step" : undefined}
              onClick={() => goStage(value)}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      {!frozen && (
        <label>
          Название ДЗ
          <input
            value={title}
            maxLength={200}
            disabled={!writable}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
      )}
      {dirty && (
        <p role="status" className="dp-caption">
          Есть несохранённые изменения
        </p>
      )}
      <HomeworkPreparation context={context} />
      <HomeworkAssignment context={context} />
      <HomeworkPreview context={context} />
      <Modal
        open={draft.blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open) draft.blocker.reset?.();
        }}
        title="Сохранить изменения ДЗ?"
        description={
          draft.recoveryError ??
          "Черновик на этом устройстве сохранён. Перед уходом можно сохранить его на сервере"
        }
      >
        <div className="hw-actions">
          <button disabled={busy} onClick={() => draft.blocker.reset?.()}>
            Продолжить редактирование
          </button>
          <button disabled={busy} onClick={() => draft.blocker.proceed?.()}>
            Выйти
          </button>
          <button
            className="dp-primary"
            disabled={busy || !title.trim()}
            onClick={() => {
              void change
                .mutateAsync(saveDraft)
                .then(() => draft.blocker.proceed?.())
                .catch(() => {});
            }}
          >
            Сохранить и выйти
          </button>
        </div>
        <ErrorMessage error={change.error} />
      </Modal>
    </div>
  );
}
