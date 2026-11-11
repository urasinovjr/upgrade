import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router";
import { studentGateway } from "../../data/studentGateway";
import { AuthLayout } from "../auth/AuthLayout";
import { ErrorMessage } from "../../shared/ui";

export default function StudentAuth() {
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const activating = location.pathname.endsWith("activate");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const token = location.hash.slice(1);
  const auth = useMutation({
    mutationFn: () =>
      activating ? studentGateway.activate(token, password) : studentGateway.login(login, password),
    onSuccess: (result) => {
      client.clear();
      if (!activating) navigate("/student", { replace: true });
      else {
        setLogin(result.login);
        history.replaceState(null, "", location.pathname);
      }
    },
  });
  return (
    <AuthLayout
      title={activating ? "Активировать доступ" : "Вход для ученика"}
      lead={
        activating
          ? "Задайте пароль. Логин появится после активации"
          : "Введите логин, полученный при активации, и свой пароль"
      }
      footer={
        <Link to={activating ? "/student/login" : "/login"}>
          {activating ? "Уже есть доступ? Войти" : "Вход для репетитора"}
        </Link>
      }
    >
      {activating && auth.isSuccess ? (
        <div>
          <p role="status">Доступ активирован. Сохраните логин для следующих входов</p>
          <label>
            Ваш логин
            <input readOnly value={login} onFocus={(event) => event.target.select()} />
          </label>
          <Link className="dp-button dp-primary" to="/student">
            Открыть мои ДЗ
          </Link>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            auth.mutate();
          }}
        >
          {!activating && (
            <label>
              Логин
              <input
                required
                value={login}
                autoComplete="username"
                onChange={(event) => setLogin(event.target.value)}
              />
            </label>
          )}
          <label>
            Пароль
            <input
              type="password"
              required
              minLength={activating ? 10 : 1}
              maxLength={128}
              value={password}
              autoComplete={activating ? "new-password" : "current-password"}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {activating && !token && (
            <p role="alert">Откройте полную ссылку приглашения от репетитора</p>
          )}
          <ErrorMessage error={auth.error} />
          <button className="dp-primary" disabled={auth.isPending || (activating && !token)}>
            {auth.isPending ? "Проверяем…" : activating ? "Задать пароль" : "Войти"}
          </button>
          {!activating && (
            <p className="dp-caption">
              Забыли пароль? Попросите репетитора перевыпустить приглашение
            </p>
          )}
        </form>
      )}
    </AuthLayout>
  );
}
