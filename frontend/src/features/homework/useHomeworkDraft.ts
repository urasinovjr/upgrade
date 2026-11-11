import { useState } from "react";
import { useBeforeUnload, useBlocker } from "react-router";
import type { Homework, HomeworkTask } from "../../domain/homework";

interface EditorDraft {
  title: string;
  tasks: HomeworkTask[];
  source: string;
  revision: number;
}

export function useHomeworkDraft(homework: Homework) {
  const key = "upgrade-homework-editor-" + homework.id;
  const [recoveryError, setRecoveryError] = useState<string>();
  const [draft, setDraft] = useState<EditorDraft>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? "null") as EditorDraft | null;
      if (
        !homework.assignedAt &&
        stored &&
        Number.isInteger(stored.revision) &&
        typeof stored.title === "string" &&
        typeof stored.source === "string" &&
        Array.isArray(stored.tasks)
      )
        return stored;
    } catch {}
    return {
      title: homework.title,
      tasks: homework.tasks,
      source: homework.sourceText ?? "",
      revision: homework.revision,
    };
  });
  const dirty =
    !homework.assignedAt &&
    (draft.title !== homework.title ||
      JSON.stringify(draft.tasks) !== JSON.stringify(homework.tasks) ||
      draft.source !== (homework.sourceText ?? ""));
  const persist = (next?: EditorDraft) => {
    try {
      if (next) localStorage.setItem(key, JSON.stringify(next));
      else localStorage.removeItem(key);
      setRecoveryError(undefined);
    } catch {
      setRecoveryError(
        "Не удалось сохранить правки на устройстве. Сохраните черновик на сервере перед закрытием страницы",
      );
    }
  };
  const change = (patch: Partial<EditorDraft>) => {
    const next = { ...draft, ...patch };
    persist(next);
    setDraft(next);
  };
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useBeforeUnload((event) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  const saved = (item: Homework) => {
    persist();
    setDraft({
      title: item.title,
      tasks: item.tasks,
      source: item.sourceText ?? "",
      revision: item.revision,
    });
  };
  return {
    ...draft,
    dirty,
    blocker,
    saved,
    recoveryError,
    setTitle: (title: string) => change({ title }),
    setTasks: (tasks: HomeworkTask[]) => change({ tasks }),
    setSource: (source: string) => change({ source }),
  };
}
