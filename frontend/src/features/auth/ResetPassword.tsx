import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { account } from "../../data/account";
import { ErrorMessage } from "../../shared/ui";
import { AuthLayout } from "./AuthLayout";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const reset = useMutation({
    mutationFn: () => account.resetPassword(params.get("token") ?? "", password),
  });
  if (reset.isSuccess)
    return (
      <AuthLayout
        title="Пароль обновлён"
        lead="Войдите с новым паролем. Остальные устройства вышли из аккаунта."
      >
        <Link className="dp-button dp-primary" to="/login">
          Войти
        </Link>
      </AuthLayout>
    );
  const mismatch = repeat.length > 0 && repeat !== password;
  return (
    <AuthLayout title="Новый пароль" footer={<Link to="/login">Вернуться ко входу</Link>}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!mismatch) reset.mutate();
        }}
      >
        <label>
          Новый пароль
          <input
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label>
          Повторите пароль
          <input
            type="password"
            required
            autoComplete="new-password"
            aria-invalid={mismatch}
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
          />
        </label>
        {mismatch && <p className="dp-error">Пароли не совпадают.</p>}
        <ErrorMessage error={reset.error} />
        <button className="dp-primary" disabled={reset.isPending || mismatch}>
          Сохранить пароль
        </button>
      </form>
    </AuthLayout>
  );
}
