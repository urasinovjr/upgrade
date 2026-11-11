import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import type { HomeworkJob, Material } from "../../domain/homework";
import { gateway } from "../../data/gateway";
import { currentRevision } from "../../domain/review";
import { topicLabel } from "../../data/catalog";
import { useWriteAccess } from "../../shared/session";
import { ErrorMessage } from "../../shared/ui";
import { useActiveTime } from "../timing/useActiveTime";
import { newHomeworkTask } from "../../domain/homework";

function MaterialEditor({ job }: { job: HomeworkJob }) {
  const [draft, setDraft] = useState(job.result as Material);
  const [saved, setSaved] = useState(JSON.stringify(job.result));
  const [homeworkId] = useState(() => crypto.randomUUID());
  const navigate = useNavigate();
  const access = useWriteAccess();
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () => gateway.homework.saveMaterial(job.id, draft),
    onSuccess: async () => {
      setSaved(JSON.stringify(draft));
      await client.invalidateQueries({ queryKey: ["materials"] });
    },
  });
  const create = useMutation({
    mutationFn: () =>
      gateway.homework.save(homeworkId, {
        title: "Отработка · три упражнения",
        baseRevision: 0,
        sourceText: "",
        tasks: draft.exercises.map((exercise, index) => ({
          ...newHomeworkTask(),
          title: "Упражнение " + (index + 1),
          condition: exercise.condition,
        })),
      }),
    onSuccess: async (homework) => {
      await client.invalidateQueries({ queryKey: ["homework"] });
      navigate("/homework/" + homework.id + "?stage=review");
    },
  });
  const busy = save.isPending || create.isPending;
  return (
    <form
      className="hw-task"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <label>
        Краткое объяснение
        <textarea
          value={draft.explanation}
          required
          maxLength={10000}
          disabled={!access.allowed || busy}
          onChange={(event) => setDraft({ ...draft, explanation: event.target.value })}
        />
      </label>
      {draft.exercises.map((exercise, index) => (
        <fieldset key={index} disabled={!access.allowed || busy}>
          <legend>Упражнение {index + 1}</legend>
          {(["condition", "answer", "solution"] as const).map((field) => (
            <label key={field}>
              {{ condition: "Условие", answer: "Ответ", solution: "Решение" }[field]}
              <textarea
                value={exercise[field]}
                required
                maxLength={field === "answer" ? 5000 : 10000}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    exercises: draft.exercises.map((item, position) =>
                      position === index ? { ...item, [field]: event.target.value } : item,
                    ),
                  })
                }
              />
            </label>
          ))}
        </fieldset>
      ))}
      <ErrorMessage error={save.error || create.error} />
      <p role="status" className="dp-caption">
        {save.isPending
          ? "Сохраняем отработку…"
          : JSON.stringify(draft) === saved
            ? "Отработка сохранена"
            : "Есть несохранённые изменения"}
      </p>
      <button disabled={!access.allowed || busy}>Сохранить отработку</button>
      <button
        type="button"
        disabled={
          !access.allowed || busy || draft.exercises.some((exercise) => !exercise.condition.trim())
        }
        onClick={() => create.mutate()}
      >
        {create.isPending ? "Создаём ДЗ…" : "Создать ДЗ из условий"}
      </button>
      <p className="dp-caption">Три условия будут перенесены в новый черновик для сверки</p>
    </form>
  );
}

export function Materials({ work }: { work: import("../../domain/models").Work }) {
  useActiveTime("remediation", work.id);
  const access = useWriteAccess();
  const client = useQueryClient();
  const gaps =
    currentRevision(work)?.draft.tasks.filter((task) => task.gap?.decision === "confirmed") ?? [];
  const query = useQuery({
    queryKey: ["materials", work.id],
    queryFn: () => gateway.homework.materials(work.id),
    refetchInterval: (query) =>
      query.state.data?.some((job) => job.status === "queued") ? 1500 : false,
  });
  const generate = useMutation({
    mutationFn: (taskId: string) => gateway.homework.material(work.id, taskId),
    onSuccess: () => client.invalidateQueries({ queryKey: ["materials", work.id] }),
  });
  return (
    <section className="hw-materials">
      <p className="dp-caption">
        Объяснение и три упражнения с ответами и решениями для вас. Чтобы назначить упражнения
        ученику, создайте из них ДЗ
      </p>
      {!gaps.length && (
        <p className="dp-caption">
          Отработка доступна после подтверждения гипотезы и публикации результата
        </p>
      )}
      {gaps.map((task) => (
        <button
          key={task.id}
          disabled={!access.allowed || generate.isPending}
          onClick={() => generate.mutate(task.id)}
        >
          {generate.isPending && generate.variables === task.id
            ? "Запускаем подготовку…"
            : "Подготовить отработку: " + topicLabel(task.gap!.topicId)}
        </button>
      ))}
      <ErrorMessage error={query.error || generate.error} />
      {query.isPending && <p role="status">Загружаем отработку…</p>}
      {query.data?.some((job) => job.status === "queued") && (
        <p role="status">Готовим отработку…</p>
      )}
      {query.data?.map((job) => (
        <details key={job.id}>
          <summary>
            {job.status === "ready"
              ? "Открыть отработку"
              : job.status === "queued"
                ? "Готовим отработку…"
                : "Не удалось подготовить отработку. Запустите подготовку ещё раз"}
          </summary>
          {job.status === "ready" && job.result && "exercises" in job.result && (
            <MaterialEditor job={job} />
          )}
        </details>
      ))}
    </section>
  );
}
