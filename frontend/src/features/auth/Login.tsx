import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { account } from "../../data/account";
import { ApiError } from "../../data/api";
import { useSession, useSetSession } from "../../shared/session";
import { ErrorMessage } from "../../shared/ui";
import { AuthAside } from "./AuthAside";
import { AuthLayout } from "./AuthLayout";
import { safeNext } from "./next";
import { ProviderButtons } from "./ProviderButtons";
import { useInkTick } from "./useInkTick";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const session = useSession();
  const setSession = useSetSession();
  const next = safeNext(params.get("next"));
  const tick = useInkTick();
  const login = useMutation({
    mutationFn: () => account.login(email, password),
    onSuccess: async (started) => {
      await tick.finish();
      setSession(started);
      navigate(next, { replace: true, viewTransition: true });
    },
  });
  const resend = useMutation({ mutationFn: () => account.resendConfirmation(email) });
  const notConfirmed =
    login.error instanceof ApiError && login.error.code === "email_not_confirmed";
  if (session.data) return <Navigate to={next} replace />;
  return (
    <AuthLayout
      title="Вход"
      ticked={tick.ticked}
      aside={
        <AuthAside caption="Черновики разборов ждут вас в кабинете. В отчёт попадает опубликованный вами результат" />
      }
      footer={
        <>
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
          <br />
          <Link to="/student/login">Вход для ученика</Link>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          login.mutate();
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
        <label>
          Пароль
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <ErrorMessage error={login.error} />
        {notConfirmed && (
          <button
            type="button"
            disabled={resend.isPending || resend.isSuccess}
            onClick={() => resend.mutate()}
          >
            {resend.isSuccess ? "Письмо отправлено" : "Отправить письмо ещё раз"}
          </button>
        )}
        <button className="dp-primary" disabled={login.isPending}>
          {login.isPending ? "Входим…" : "Войти"}
        </button>
        <Link to="/auth/reset">Забыли пароль?</Link>
      </form>
      <ProviderButtons verb="Войти" />
    </AuthLayout>
  );
}
