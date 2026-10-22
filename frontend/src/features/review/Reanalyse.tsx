import { useId, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Work } from "../../domain/models";
import { Modal } from "../../shared/ui";

export function Reanalyse({
  work,
  busy,
  unchecked,
  run,
}: {
  work: Work;
  busy: boolean;
  unchecked: number;
  run: () => void;
}) {
  const [open, setOpen] = useState(false);
  const noteId = useId();
  const start = () => {
    setOpen(false);
    run();
  };
  return (
    <>
      <button
        disabled={busy || unchecked > 0}
        aria-describedby={unchecked > 0 ? noteId : undefined}
        onClick={() => (work.analysis ? setOpen(true) : run())}
      >
        <RefreshCw size={14} aria-hidden="true" />
        {work.demo ? "Повторить разбор" : "Запустить разбор"}
      </button>
      {unchecked > 0 && (
        <span id={noteId} className="dp-reanalyse-note">
          Перед разбором проверьте страницы оригинала: осталось {unchecked}.
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
