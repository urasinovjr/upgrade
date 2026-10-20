import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router";
import { account } from "../../data/account";
import { ErrorMessage } from "../../shared/ui";
import { AuthLayout } from "./AuthLayout";

export default function ResetRequest() {
  const [email, setEmail] = useState("");
  const reset = useMutation({ mutationFn: () => account.requestReset(email) });
  const footer = <Link to="/login">Вернуться ко входу</Link>;
  if (reset.isSuccess)
    return (
      <AuthLayout
        title="Проверьте почту"
        lead={`Если аккаунт с адресом ${email} существует, мы отправили ссылку для смены пароля. Она действует час.`}
        footer={footer}
      >
        {null}
      </AuthLayout>
    );
  return (
    <AuthLayout title="Смена пароля" lead="Пришлём ссылку для нового пароля." footer={footer}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          reset.mutate();
        }}
      >
        <label>
          Почта
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <ErrorMessage error={reset.error} />
        <button className="dp-primary" disabled={reset.isPending}>
          Отправить ссылку
        </button>
      </form>
    </AuthLayout>
  );
}
