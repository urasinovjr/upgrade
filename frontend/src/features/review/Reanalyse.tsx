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
        {work.demo || work.analysis ? "Запустить разбор заново" : "Запустить разбор"}
      </button>
      {blocked && (
        <span id={noteId} className="dp-reanalyse-note">
          {unchecked > 0 && `Отметьте «Данные скрыты» ещё на ${unchecked} стр. оригинала. `}
          {nameIssues.length > 0 && `В тексте осталось имя ученика: ${nameIssues.join("; ")}.`}
        </span>
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Запустить разбор заново?"
        description="ИИ разберёт работу заново и заменит вердикты, объяснения, гипотезы о пробелах и комментарии. Шаги, которые вы исправили, сохранятся, если файлы и порядок страниц не менялись."
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
