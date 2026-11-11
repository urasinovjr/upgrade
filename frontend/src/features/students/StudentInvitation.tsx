import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { gateway, serverMode } from "../../data/gateway";
import { Modal, ErrorMessage } from "../../shared/ui";
import "../homework/homework.css";

export function StudentInvitation({
  studentId,
  disabled,
}: {
  studentId: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const invitation = useMutation({ mutationFn: () => gateway.homework.invite(studentId) });
  const copy = useMutation({
    mutationFn: () => navigator.clipboard.writeText(invitation.data?.url ?? ""),
  });
  return (
    <>
      <button
        className="dp-compact-action dp-student-access"
        aria-label="Доступ ученика"
        title="Доступ ученика"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <KeyRound size={14} aria-hidden="true" />
        <span>Доступ ученика</span>
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Приглашение ученика"
        description={
          serverMode
            ? "Передайте ссылку ученику сами. Она действует семь дней и используется один раз. Новая ссылка отключает прежний пароль и завершает сессии ученика"
            : "В демо ссылка открывает пример кабинета ученика в этом браузере"
        }
      >
        <div className="hw-invitation">
          <button
            disabled={invitation.isPending || disabled}
            onClick={() => {
              invitation.mutate();
              copy.reset();
            }}
          >
            {invitation.isPending
              ? "Создаём ссылку…"
              : invitation.data
                ? "Перевыпустить приглашение"
                : "Создать приглашение"}
          </button>
          <ErrorMessage error={invitation.error || copy.error} />
          {invitation.data && (
            <>
              <label>
                Логин
                <input readOnly value={invitation.data.login} />
              </label>
              <label>
                Ссылка активации
                <input
                  readOnly
                  value={invitation.data.url}
                  onFocus={(event) => event.target.select()}
                />
              </label>
              <button onClick={() => copy.mutate()}>Скопировать ссылку</button>
              {copy.isSuccess && <p role="status">Ссылка скопирована</p>}
              {!serverMode && <a href={invitation.data.url}>Открыть кабинет ученика</a>}
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
