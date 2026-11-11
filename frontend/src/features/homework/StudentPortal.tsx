import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { studentGateway } from "../../data/studentGateway";
import { serverMode } from "../../data/gateway";
import { resultLabels } from "../../domain/homework";
import { topicLabel } from "../../data/catalog";
import { Formula, MixedText } from "../../shared/math";
import { verdictMeta } from "../../shared/status";
import { ErrorMessage, PageLoading, PageState, Wordmark } from "../../shared/ui";
import { SubmissionForm } from "./SubmissionForm";
import "./homework.css";

export default function StudentPortal() {
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<string>();
  const [notice, setNotice] = useState("");
  const demoId = params.get("demo");
  const navigate = useNavigate();
  const client = useQueryClient();
  const session = useQuery({
    queryKey: ["student-session", demoId],
    queryFn: () => studentGateway.session(demoId),
    refetchInterval: 15000,
  });
  const state = useQuery({
    queryKey: ["student-state", session.data?.id],
    queryFn: () => studentGateway.state(session.data!.id),
    enabled: Boolean(session.data),
    refetchInterval: 4000,
  });
  const logout = useMutation({
    mutationFn: async () => {
      if (serverMode) await studentGateway.logout();
      client.clear();
      navigate("/student/login", { replace: true });
    },
  });
  if (session.isPending)
    return (
      <div className="dp-app hw-portal">
        <PageLoading />
      </div>
    );
  if (session.isError)
    return (
      <div className="dp-app hw-portal">
        <PageState
          title="Кабинет ученика"
          errorTitle="Не удалось открыть кабинет"
          error={session.error}
          retry={() => void session.refetch()}
        />
      </div>
    );
  if (!session.data) return <Navigate to={serverMode ? "/student/login" : "/homework"} replace />;
  const assignment = state.data?.assignments.find((item) => item.id === selected);
  const exportResults = () => {
    const text = (state.data?.submissions ?? [])
      .filter((work) => work.result)
      .map(
        (work) =>
          work.title +
          "\n" +
          work.result!.feedback +
          "\n" +
          work
            .result!.tasks.map(
              (task) =>
                task.title +
                ": " +
                resultLabels[task.result ?? "needs_clarification"] +
                "\n" +
                task.feedback +
                "\n" +
                task.steps
                  .map((step) => step.latex + (step.explanation ? "\n" + step.explanation : ""))
                  .join("\n"),
            )
            .join("\n\n"),
      )
      .join("\n\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "Мои результаты.txt";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="dp-app hw-portal">
      <a href="#student-content" className="dp-skip">
        К содержимому
      </a>
      <header className="hw-portal-header">
        <Wordmark />
        <span>
          {session.data.name} · {session.data.grade} класс
        </span>
        {serverMode ? (
          <button onClick={() => logout.mutate()} disabled={logout.isPending}>
            Выйти
          </button>
        ) : (
          <Link to="/homework">К репетитору</Link>
        )}
      </header>
      <main id="student-content" className="hw-page" tabIndex={-1}>
        <h1>Мои домашние задания</h1>
        <p className="dp-caption">Логин: {session.data.login}</p>
        {!session.data.writable && (
          <p className="hw-test-mode">
            Сейчас доступен просмотр и экспорт. Для сдачи репетитору нужно продлить подписку
          </p>
        )}
        {!serverMode && <p className="hw-test-mode">Демонстрационный кабинет в этом браузере</p>}
        <nav className="hw-portal-nav" aria-label="Кабинет ученика">
          <a href="#assignments">Задания</a>
          <a href="#history">История</a>
          <a href="#knowledge">Карта знаний</a>
        </nav>
        <ErrorMessage error={state.error || logout.error} />
        {state.isPending && <p role="status">Загружаем задания…</p>}
        {notice && (
          <p role="status" className="hw-notice">
            {notice}
          </p>
        )}
        <section id="assignments">
          <h2>Задания от репетитора</h2>
          {state.data && !state.data.assignments.length && (
            <p className="hw-empty">Репетитор ещё не назначил ДЗ</p>
          )}
          <ul className="hw-list">
            {state.data?.assignments.map((item) => {
              const previous = state.data.submissions
                .filter((work) => work.assignmentId === item.id)
                .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
              const waiting = previous?.status === "submitted";
              return (
                <li key={item.id}>
                  <div className="hw-assignment-row">
                    <div>
                      <strong>{item.title}</strong>
                      <p className="dp-caption">
                        {item.deadline
                          ? "До " + new Date(item.deadline).toLocaleString("ru-RU")
                          : "Без срока сдачи"}
                      </p>
                    </div>
                    <button
                      aria-expanded={selected === item.id && !waiting}
                      disabled={!session.data?.writable || waiting}
                      onClick={() => {
                        setSelected(selected === item.id ? undefined : item.id);
                        setNotice("");
                      }}
                    >
                      {waiting
                        ? "Ожидает проверки"
                        : selected === item.id
                          ? "Скрыть задания"
                          : previous
                            ? "Сдать ещё раз"
                            : "Открыть задания"}
                    </button>
                  </div>
                  {assignment?.id === item.id && !waiting && (
                    <SubmissionForm
                      key={item.id}
                      assignment={item}
                      writable={session.data?.writable ?? false}
                      loadAsset={studentGateway.asset}
                      onSubmit={(data, uploads) => studentGateway.submit(item.id, data, uploads)}
                      onSuccess={() => {
                        setSelected(undefined);
                        setNotice("ДЗ отправлено. Результат появится после проверки");
                        void client.invalidateQueries({ queryKey: ["student-state"] });
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        <section id="history">
          <header className="hw-heading">
            <h2>История работ</h2>
            <button
              disabled={!state.data?.submissions.some((work) => work.result)}
              onClick={exportResults}
            >
              Скачать результаты
            </button>
          </header>
          {state.data && !state.data.submissions.length && (
            <p className="hw-empty">Сданные работы появятся здесь</p>
          )}
          {state.data?.submissions.map((work) => (
            <article className="hw-task" key={work.id}>
              <h3>{work.title}</h3>
              <p className="dp-caption">
                Попытка {work.attemptNumber} ·{" "}
                {work.status === "published" ? "Результат опубликован" : "Ожидает публикации"} ·{" "}
                {new Date(work.submittedAt).toLocaleString("ru-RU")}
                {work.late && " · Сдано с опозданием"}
              </p>
              {!work.result ? (
                <p>Ожидает проверки</p>
              ) : (
                <>
                  <p>
                    <MixedText value={work.result.feedback} />
                  </p>
                  {work.result.tasks.map((task) => (
                    <details key={task.id}>
                      <summary>
                        {task.title} · {resultLabels[task.result ?? "needs_clarification"]}
                      </summary>
                      <p className="hw-condition-text">
                        <MixedText value={task.condition} />
                      </p>
                      {task.formula && <Formula value={task.formula} />}
                      <p>
                        <MixedText value={task.feedback} />
                      </p>
                      <ol>
                        {task.steps.map((step) => (
                          <li key={step.id} className={"hw-history-step hw-step-" + step.verdict}>
                            <strong className="hw-step-label">
                              {verdictMeta[step.verdict].label}
                            </strong>
                            <Formula value={step.latex} />
                            {step.explanation && (
                              <p>
                                <MixedText value={step.explanation} />
                              </p>
                            )}
                          </li>
                        ))}
                      </ol>
                      {task.gap && (
                        <p>
                          Повторите: {topicLabel(task.gap.topicId)}.{" "}
                          <MixedText value={task.gap.reason} />
                        </p>
                      )}
                    </details>
                  ))}
                </>
              )}
            </article>
          ))}
        </section>
        <section id="knowledge">
          <h2>Карта знаний</h2>
          <p className="dp-caption">Темы, которые подтвердил репетитор</p>
          {!state.data?.knowledge.length && (
            <p className="hw-empty">Подтверждённых пробелов пока нет</p>
          )}
          <ul className="hw-list">
            {state.data?.knowledge.map((gap) => (
              <li key={gap.topicId}>
                <strong>{topicLabel(gap.topicId)}</strong>
                <p>{gap.reason}</p>
                <span>{gap.closed ? "Повторено" : "Нужно повторить"}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
