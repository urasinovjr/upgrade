import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { HomeworkTask, HomeworkFile, Submission } from "../../domain/homework";
import type { Upload } from "../../domain/models";
import {
  clearSubmissionDraft,
  readSubmissionDraft,
  saveSubmissionDraft,
  type SubmissionDraft,
} from "../../data/submissionDrafts";
import { decodeUpload } from "../../shared/uploads";
import { MediaViewer } from "../../shared/MediaViewer";
import { Formula, MixedText } from "../../shared/math";
import { ErrorMessage } from "../../shared/ui";

export function SubmissionForm<T>({
  assignment,
  writable,
  onSubmit,
  onSuccess,
  loadAsset,
}: {
  assignment: {
    id: string;
    title: string;
    tasks: HomeworkTask[];
    files?: HomeworkFile[];
    deadline: string | null;
  };
  writable: boolean;
  onSubmit: (submission: Submission, uploads: Upload[]) => Promise<T>;
  onSuccess: (result: T) => void;
  loadAsset?: (id: string) => Promise<Blob>;
}) {
  const stored = useQuery({
    queryKey: ["submission-draft", assignment.id],
    queryFn: () => readSubmissionDraft(assignment.id),
  });
  const [edits, setEdits] = useState<SubmissionDraft>();
  const draft = edits ?? stored.data;
  const save = useMutation({
    mutationFn: async (next: SubmissionDraft) => {
      await saveSubmissionDraft(assignment.id, next);
      setEdits(next);
    },
  });
  const upload = useMutation({
    scope: { id: "submission-upload-" + assignment.id },
    mutationFn: async ({ taskId, files }: { taskId: string; files: File[] }) => {
      if (!draft) return;
      const added = await Promise.all(files.map(decodeUpload));
      const current = await readSubmissionDraft(assignment.id);
      const next = {
        ...current,
        taskFiles: {
          ...current.taskFiles,
          [taskId]: [...(current.taskFiles[taskId] ?? []), ...added.map((upload) => upload.id)],
        },
        uploads: [...current.uploads, ...added],
      };
      await saveSubmissionDraft(assignment.id, next);
      setEdits(next);
    },
  });
  const send = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Фотографии ещё загружаются");
      const result = await onSubmit({ id: draft.id, taskFiles: draft.taskFiles }, draft.uploads);
      await clearSubmissionDraft(assignment.id);
      return result;
    },
    onSuccess,
  });
  const busy = upload.isPending || save.isPending || send.isPending;
  if (stored.isPending) return <p role="status">Восстанавливаем фотографии…</p>;
  if (stored.isError)
    return (
      <>
        <ErrorMessage error={stored.error} />
        <button onClick={() => void stored.refetch()}>Повторить загрузку</button>
      </>
    );
  const skipped = assignment.tasks.filter((task) => !draft?.taskFiles[task.id]?.length).length;
  return (
    <form
      className="hw-submission"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) send.mutate();
      }}
    >
      {assignment.deadline && (
        <p className="dp-caption">После указанного срока сдача будет отмечена как опоздавшая</p>
      )}
      {assignment.tasks.map((task) => {
        const ids = draft?.taskFiles[task.id] ?? [];
        const uploads = draft?.uploads.filter((upload) => ids.includes(upload.id)) ?? [];
        const originals =
          assignment.files?.filter((file) => task.conditionFileIds.includes(file.id)) ?? [];
        return (
          <section className="hw-task" key={task.id}>
            <h3>{task.title}</h3>
            <p className="hw-condition-text">
              <MixedText value={task.condition} />
            </p>
            {task.formula && <Formula value={task.formula} />}
            {loadAsset && originals.length > 0 && (
              <details>
                <summary>Чертёж и оригинал условия</summary>
                <MediaViewer
                  files={originals.map((file) => ({
                    ...file,
                    size: 0,
                    crops: {},
                    pageOrder: Array.from({ length: file.pages }, (_, i) => i + 1),
                  }))}
                  loadAsset={loadAsset}
                  compact
                  selectionKey={assignment.id + ":condition:" + task.id}
                />
              </details>
            )}
            <label className="hw-file-label">
              Фотографии решения
              <span>Выбрать фотографии</span>
              <input
                className="hw-file-input"
                type="file"
                multiple
                accept="image/jpeg,image/png"
                disabled={!writable || busy}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  if (files.length) upload.mutate({ taskId: task.id, files });
                  event.target.value = "";
                }}
              />
            </label>
            {!uploads.length && (
              <p className="dp-caption">Решение пока не приложено. Задание можно пропустить</p>
            )}
            {uploads.length > 0 && (
              <>
                <MediaViewer
                  files={uploads}
                  uploads={uploads}
                  compact
                  selectionKey={assignment.id + ":solution:" + task.id}
                />
                <ul className="hw-uploads">
                  {uploads.map((upload) => (
                    <li key={upload.id}>
                      <span>{upload.name}</span>
                      <button
                        type="button"
                        className="dp-text"
                        disabled={!writable || busy}
                        onClick={() => {
                          if (draft)
                            save.mutate({
                              ...draft,
                              uploads: draft.uploads.filter((item) => item.id !== upload.id),
                              taskFiles: {
                                ...draft.taskFiles,
                                [task.id]: ids.filter((id) => id !== upload.id),
                              },
                            });
                        }}
                      >
                        Убрать
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        );
      })}
      <ErrorMessage error={upload.error || save.error || send.error} />
      <p className="dp-caption" role="status">
        {busy ? "Сохраняем…" : "Выбранные фотографии сохранены в этом браузере"}
        {skipped ? " Заданий без решения: " + skipped + "." : ""}
      </p>
      {!writable && (
        <p role="status">Сейчас доступен только просмотр. Репетитору нужно продлить подписку</p>
      )}
      <button className="dp-primary" disabled={!writable || busy || !draft}>
        {send.isPending ? "Отправляем…" : "Отправить ДЗ целиком"}
      </button>
    </form>
  );
}
