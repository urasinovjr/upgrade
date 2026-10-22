import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Square, Timer, Trash2 } from "lucide-react";
import { families, type FamilyId } from "../../domain/families";
import {
  clockText,
  elapsedMs,
  pause,
  resume,
  startStopwatch,
  type StopwatchState,
} from "../../domain/stopwatch";
import { timing, type ManualSession } from "../../data/timing";
import { useStore } from "../../shared/query";
import { ErrorMessage, PageLoading, PageState } from "../../shared/ui";
import { useTiming } from "./useTiming";
import "../account/account.css";

const storageKey = "upgrade-stopwatch";

function loadStopwatch(): StopwatchState | undefined {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as StopwatchState) : undefined;
  } catch {
    return undefined;
  }
}

function keepStopwatch(state: StopwatchState | undefined) {
  try {
    if (state) localStorage.setItem(storageKey, JSON.stringify(state));
    else localStorage.removeItem(storageKey);
  } catch {
    return;
  }
}

function useNow(running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  return now;
}

function familyLabel(id: string) {
  return families.find((family) => family.id === id)?.label ?? id;
}

function sessionMinutes(item: ManualSession) {
  return Math.round((item.correctedSeconds ?? item.activeSeconds) / 6) / 10;
}

export default function Stopwatch() {
  const enabled = useTiming();
  const store = useStore();
  const client = useQueryClient();
  const sessions = useQuery({ queryKey: ["manual"], queryFn: timing.manual, enabled });
  const [state, setState] = useState(loadStopwatch);
  const [studentId, setStudentId] = useState("");
  const [taskCount, setTaskCount] = useState("3");
  const [taskFamily, setTaskFamily] = useState<FamilyId>("equations");
  const [finished, setFinished] = useState<{ state: StopwatchState; ms: number; at: number }>();
  const [minutes, setMinutes] = useState("");
  const now = useNow(state?.runningSince !== undefined);
  const save = useMutation({
    mutationFn: timing.saveManual,
    onSuccess: () => {
      setFinished(undefined);
      void client.invalidateQueries({ queryKey: ["manual"] });
    },
  });
  const remove = useMutation({
    mutationFn: timing.removeManual,
    onSuccess: () => void client.invalidateQueries({ queryKey: ["manual"] }),
  });
  if (!enabled)
    return (
      <PageState
        title="Замер не включён"
        description="Секундомер ручной проверки доступен участникам пилота."
        icon={Timer}
        to="/settings"
        linkLabel="Открыть настройки"
      />
    );
  if (!store.data) return <PageLoading variant="list" />;
  const students = store.data.students.filter((student) => !student.archivedAt);
  const studentName = (id: string) => students.find((item) => item.id === id)?.name ?? "Ученик";
  const update = (next: StopwatchState | undefined) => {
    keepStopwatch(next);
    setState(next);
  };
  const finish = (current: StopwatchState) => {
    const at = Date.now();
    const ms = elapsedMs(current, at);
    setFinished({ state: current, ms, at });
    setMinutes(String(Math.round(ms / 6000) / 10));
    update(undefined);
  };
  const record = () => {
    if (!finished) return;
    const activeSeconds = Math.round(finished.ms / 1000);
    const corrected = Math.round(Number(minutes.replace(",", ".")) * 60);
    save.mutate({
      id: finished.state.id,
      studentId: finished.state.studentId,
      taskCount: finished.state.taskCount,
      taskFamily: finished.state.taskFamily as FamilyId,
      activeSeconds,
      correctedSeconds:
        Number.isFinite(corrected) && corrected !== activeSeconds ? corrected : null,
      startedAt: new Date(finished.state.startedAt).toISOString(),
      finishedAt: new Date(finished.at).toISOString(),
    });
  };
  return (
    <div className="dp-page dp-account">
      <h1>Ручная проверка</h1>
      <section className="dp-account-section" aria-labelledby="stopwatch-title">
        <h2 id="stopwatch-title">Секундомер</h2>
        <p className="dp-caption">
          Замерьте проверку работы без UpGrade: на бумаге или в привычном редакторе. Эти замеры
          сравниваются с активным временем в UpGrade.
        </p>
        {state ? (
          <>
            <p>
              {studentName(state.studentId)} · задач: {state.taskCount} ·{" "}
              {familyLabel(state.taskFamily)}
            </p>
            <p className="dp-stopwatch-clock" role="timer" aria-live="off">
              {clockText(elapsedMs(state, now))}
            </p>
            <div className="dp-account-row">
              {state.runningSince === undefined ? (
                <button onClick={() => update(resume(state, Date.now()))}>
                  <Play size={14} aria-hidden="true" />
                  Продолжить
                </button>
              ) : (
                <button onClick={() => update(pause(state, Date.now()))}>
                  <Pause size={14} aria-hidden="true" />
                  Пауза
                </button>
              )}
              <button className="dp-primary" onClick={() => finish(state)}>
                <Square size={14} aria-hidden="true" />
                Закончить проверку
              </button>
            </div>
          </>
        ) : finished ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              record();
            }}
          >
            <p>Измерено: {clockText(finished.ms)}</p>
            <label>
              Время проверки, минут
              <input
                type="number"
                min={0}
                step={0.1}
                required
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
              />
            </label>
            <ErrorMessage error={save.error} />
            <div className="dp-account-row">
              <button type="button" onClick={() => setFinished(undefined)}>
                Не сохранять
              </button>
              <button className="dp-primary" disabled={save.isPending}>
                Сохранить замер
              </button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              update(
                startStopwatch({
                  studentId: studentId || students[0]?.id || "",
                  taskCount: Math.max(1, Math.min(100, Number(taskCount) || 1)),
                  taskFamily,
                }),
              );
            }}
          >
            <label>
              Ученик
              <select
                required
                value={studentId || students[0]?.id || ""}
                onChange={(event) => setStudentId(event.target.value)}
              >
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Число задач
              <input
                type="number"
                min={1}
                max={100}
                required
                value={taskCount}
                onChange={(event) => setTaskCount(event.target.value)}
              />
            </label>
            <label>
              Семейство задач
              <select
                value={taskFamily}
                onChange={(event) => setTaskFamily(event.target.value as FamilyId)}
              >
                {families.map((family) => (
                  <option key={family.id} value={family.id}>
                    {family.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="dp-primary" disabled={!students.length}>
              <Play size={14} aria-hidden="true" />
              Начать проверку
            </button>
            {!students.length && <p>Сначала добавьте ученика.</p>}
          </form>
        )}
      </section>
      <section className="dp-account-section" aria-labelledby="manual-list-title">
        <h2 id="manual-list-title">Сохранённые замеры</h2>
        <ErrorMessage error={sessions.error ?? remove.error} />
        {sessions.data?.length ? (
          <ul className="dp-manual-list">
            {sessions.data.map((item) => (
              <li key={item.id} className="dp-account-row">
                <span>
                  {new Date(item.finishedAt).toLocaleDateString("ru-RU")} ·{" "}
                  {studentName(item.studentId)} · задач: {item.taskCount} ·{" "}
                  {familyLabel(item.taskFamily)} · {sessionMinutes(item)} мин
                </span>
                <button
                  className="dp-text"
                  aria-label="Удалить замер"
                  onClick={() => remove.mutate(item.id)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dp-caption">Замеров пока нет.</p>
        )}
      </section>
    </div>
  );
}
