import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, type ReactNode, type RefObject } from "react";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  initialFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dp-overlay" />
        <Dialog.Content
          className="dp-dialog"
          onOpenAutoFocus={(event) => {
            opener.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            if (initialFocusRef?.current) {
              event.preventDefault();
              initialFocusRef.current.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
          }}
        >
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>
            {description || "Заполните данные и сохраните изменения."}
          </Dialog.Description>
          <Dialog.Close className="dp-icon dp-dialog-close" aria-label="Закрыть">
            <X size={18} />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
