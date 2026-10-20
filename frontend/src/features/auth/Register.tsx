import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router";
import { account, type Consents } from "../../data/account";
import { useAuthConfig } from "../../shared/session";
import { ErrorMessage } from "../../shared/ui";
import { AuthLayout } from "./AuthLayout";
import { ProviderButtons } from "./ProviderButtons";

export default function Register() {
  const config = useAuthConfig();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPersonalData, setAcceptPersonalData] = useState(false);
  const consents: Consents | undefined = config.data && {
    acceptTerms,
    acceptPersonalData,
    termsVersion: config.data.termsVersion,
    personalDataVersion: config.data.personalDataVersion,
  };
  const register = useMutation({
    mutationFn: () => account.register({ displayName, email, password, ...consents! }),
  });
  const resend = useMutation({ mutationFn: () => account.resendConfirmation(email) });
  const footer = (
    <>
      Уже есть аккаунт? <Link to="/login">Войти</Link>
    </>
  );
  if (register.isSuccess)
    return (
      <AuthLayout
        title="Проверьте почту"
        lead={`Мы отправили ссылку для подтверждения на ${email}. После подтверждения начнётся пробный период на 14 дней.`}
        footer={footer}
      >
        <button disabled={resend.isPending || resend.isSuccess} onClick={() => resend.mutate()}>
          {resend.isSuccess ? "Письмо отправлено ещё раз" : "Отправить письмо ещё раз"}
        </button>
        <ErrorMessage error={resend.error} />
      </AuthLayout>
    );
  const agreed = acceptTerms && acceptPersonalData;
  return (
    <AuthLayout title="Регистрация" lead="14 дней бесплатно, без привязки карты." footer={footer}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          register.mutate();
        }}
      >
        <label>
          Как к вам обращаться
          <input
            required
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
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
            minLength={10}
            autoComplete="new-password"
            aria-describedby="password-rule"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <small id="password-rule">Не короче 10 символов и не только из цифр.</small>
        </label>
        <label className="dp-auth-check">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(event) => setAcceptTerms(event.target.checked)}
          />
          <span>
            Принимаю{" "}
            <a href={config.data?.termsUrl} target="_blank" rel="noreferrer">
              условия использования
            </a>
          </span>
        </label>
        <label className="dp-auth-check">
          <input
            type="checkbox"
            checked={acceptPersonalData}
            onChange={(event) => setAcceptPersonalData(event.target.checked)}
          />
          <span>
            Даю{" "}
            <a href={config.data?.personalDataUrl} target="_blank" rel="noreferrer">
              согласие на обработку персональных данных
            </a>
          </span>
        </label>
        <ErrorMessage error={register.error ?? config.error} />
        <button className="dp-primary" disabled={!agreed || !consents || register.isPending}>
          {register.isPending ? "Создаём аккаунт…" : "Создать аккаунт"}
        </button>
      </form>
      {agreed && consents && <ProviderButtons verb="Зарегистрироваться" consents={consents} />}
    </AuthLayout>
  );
}
