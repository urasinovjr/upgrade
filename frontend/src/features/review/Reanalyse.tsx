import { useId, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Work } from "../../domain/models";
import { Modal } from "../../shared/ui";

export function Reanalyse({
  work,
  busy,
  unchecked,
  nameIssues,
  run,
}: {
  work: Work;
  busy: boolean;
  unchecked: number;
  nameIssues: string[];
  run: () => void;
}) {
  const [open, setOpen] = useState(false);
  const noteId = useId();
  const blocked = unchecked > 0 || nameIssues.length > 0;
  const start = () => {
    setOpen(false);
    run();
  };
  return (
    <>
      <button
        disabled={busy || blocked}
        aria-describedby={blocked ? noteId : undefined}
        onClick={() => (work.analysis ? setOpen(true) : run())}
      >
        <RefreshCw size={14} aria-hidden="true" />
        {work.demo ? "Повторить разбор" : "Запустить разбор"}
      </button>
      {blocked && (
        <span id={noteId} className="dp-reanalyse-note">
          {unchecked > 0 && `Перед разбором проверьте страницы оригинала: осталось ${unchecked}. `}
          {nameIssues.length > 0 && `Имя ученика в тексте: ${nameIssues.join("; ")}.`}
        </span>
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Запустить разбор заново?"
        description="Вердикты, объяснения, темы, гипотезы о пробелах и комментарии к задачам заменит новый ответ ИИ. Исправленные шаги решения сохранятся, если не менялись файлы и порядок страниц."
      >
        <div className="dp-dialog-actions">
          <button type="button" onClick={() => setOpen(false)}>
            Отмена
          </button>
          <button className="dp-primary" onClick={start}>
            Запустить разбор
          </button>
        </div>
      </Modal>
    </>
  );
}
