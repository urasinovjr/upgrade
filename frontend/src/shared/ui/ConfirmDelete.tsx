import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ErrorMessage } from "./ErrorMessage";
import { Modal } from "./Modal";

export function ConfirmDelete({
  label,
  confirmLabel,
  title,
  description,
  onConfirm,
}: {
  label: string;
  confirmLabel: string;
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <button className="dp-compact-action" onClick={() => setOpen(true)}>
        <Trash2 size={14} aria-hidden="true" />
        <span>{label}</span>
      </button>
      <Modal open={open} onOpenChange={setOpen} title={title} description={description}>
        <ErrorMessage error={error} />
        <div className="dp-dialog-actions">
          <button type="button" onClick={() => setOpen(false)}>
            Отмена
          </button>
          <button className="dp-destructive" disabled={pending} onClick={() => void confirm()}>
            {pending ? "Удаляем…" : confirmLabel}
          </button>
        </div>
      </Modal>
    </>
  );
}
