import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { account, providerTitles, type Provider } from "../../data/account";
import { useAuthConfig } from "../../shared/session";
import { ErrorMessage, PageLoading } from "../../shared/ui";
import "./account.css";

function Providers({ linked }: { linked: Provider[] }) {
  const config = useAuthConfig();
  const client = useQueryClient();
  const link = useMutation({
    mutationFn: account.linkProvider,
    onSuccess: ({ authorizeUrl }) => window.location.assign(authorizeUrl),
  });
  const unlink = useMutation({
    mutationFn: account.unlinkProvider,
    onSuccess: () => client.invalidateQueries({ queryKey: ["account"] }),
  });
  const providers = config.data?.providers ?? [];
  if (!providers.length) return <p className="dp-caption">Вход через сервисы пока не настроен.</p>;
  return (
    <>
      {providers.map((provider) => {
        const title = providerTitles[provider];
        const isLinked = linked.includes(provider);
        return (
          <div className="dp-account-row" key={provider}>
            <span>
              {title} · {isLinked ? "привязан" : "не привязан"}
            </span>
            {isLinked ? (
              <button disabled={unlink.isPending} onClick={() => unlink.mutate(provider)}>
                Отвязать {title}
              </button>
            ) : (
              <button disabled={link.isPending} onClick={() => link.mutate(provider)}>
                Привязать {title}
              </button>
            )}
          </div>
        );
      })}
      <ErrorMessage error={link.error ?? unlink.error} />
    </>
  );
}

function DeleteAccount({ hasPassword }: { hasPassword: boolean }) {
  const [password, setPassword] = useState("");
  const [understood, setUnderstood] = useState(false);
  const remove = useMutation({
    mutationFn: () => account.remove(hasPassword ? password : null),
    onSuccess: () => window.location.replace("/login"),
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        remove.mutate();
      }}
    >
      <p>Удалятся ученики, работы, файлы, отчёты и сам аккаунт. Восстановить их будет нельзя.</p>
      {hasPassword && (
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
      )}
      <label className="dp-account-check">
        <input
          type="checkbox"
          checked={understood}
          onChange={(event) => setUnderstood(event.target.checked)}
        />
        Понимаю, что данные удалятся без возможности восстановления
      </label>
      <ErrorMessage error={remove.error} />
      <button className="dp-destructive" disabled={!understood || remove.isPending}>
        Удалить аккаунт
      </button>
    </form>
  );
}

export default function AccountSettings() {
  const details = useQuery({ queryKey: ["account"], queryFn: account.details });
  if (details.isPending) return <PageLoading variant="list" />;
  if (details.isError) return <ErrorMessage error={details.error} />;
  const { displayName, email, hasPassword, identities } = details.data;
  return (
    <div className="dp-page dp-account">
      <h1>Настройки</h1>
      <section className="dp-account-section" aria-labelledby="profile-title">
        <h2 id="profile-title">Профиль</h2>
        <p>{displayName}</p>
        <p className="dp-caption">{email ?? "Почта не указана"}</p>
        <Link to="/subscription">Подписка</Link>
      </section>
      <section className="dp-account-section" aria-labelledby="login-title">
        <h2 id="login-title">Способы входа</h2>
        <div className="dp-account-row">
          <span>Пароль · {hasPassword ? "задан" : "не задан"}</span>
          {email && (
            <Link to="/auth/reset">{hasPassword ? "Сменить пароль" : "Задать пароль"}</Link>
          )}
        </div>
        <Providers linked={identities.map((item) => item.provider)} />
      </section>
      <section className="dp-account-section dp-account-danger" aria-labelledby="delete-title">
        <h2 id="delete-title">Удаление аккаунта</h2>
        <DeleteAccount hasPassword={hasPassword} />
      </section>
    </div>
  );
}
