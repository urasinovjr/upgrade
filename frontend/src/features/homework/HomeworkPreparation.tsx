import { gateway } from "../../data/gateway";
import { newHomeworkTask } from "../../domain/homework";
import { MediaViewer } from "../../shared/MediaViewer";
import { HomeworkTaskEditor } from "./HomeworkTaskEditor";
import { homeworkAttachment, type HomeworkEditorState } from "./useHomeworkEditor";
export function HomeworkPreparation({ context }: { context: HomeworkEditorState }) {
  const {
    homework,
    tasks,
    source,
    setTasks,
    setSource,
    dirty,
    uploadProgress,
    params,
    frozen,
    stage,
    goStage,
    completed,
    job,
    change,
    recognize,
    upload,
    writable,
    update,
    applyRecognition,
  } = context;
  return (
    <>
      {stage !== "assign" && (
        <div className={"hw-editor-columns" + (stage === "source" ? " hw-source-stage" : "")}>
          <section className="hw-original">
            <h2>Оригиналы условий</h2>
            {!frozen && (
              <label className="hw-file-label">
                Добавить фотографии или PDF
                <span>Выбрать файлы</span>
                <input
                  className="hw-file-input"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,application/pdf"
                  disabled={!writable}
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    if (files.length) upload.mutate(files);
                    event.target.value = "";
                  }}
                />
              </label>
            )}
            {uploadProgress.total > 0 && (
              <p role="status" className="dp-caption">
                {upload.isPending ? "Загружаем" : "Обработано"}: {uploadProgress.done} из{" "}
                {uploadProgress.total}
              </p>
            )}
            {!homework.files.length ? (
              <p className="dp-caption">
                Можно начать с текста. Чертёж прикрепите вместе с условием
              </p>
            ) : (
              <MediaViewer
                files={homework.files.map(homeworkAttachment)}
                loadAsset={gateway.homework.asset}
                selectionKey={homework.id}
                layoutTools={false}
                redaction={!frozen}
                update={
                  !frozen && writable && !dirty
                    ? (files) => {
                        const changed = files.find((file) => {
                          const previous = homework.files.find((item) => item.id === file.id);
                          return (
                            JSON.stringify(previous?.masks) !== JSON.stringify(file.masks) ||
                            JSON.stringify(previous?.checkedPages) !==
                              JSON.stringify(file.checkedPages)
                          );
                        });
                        if (changed)
                          change.mutate(() => gateway.homework.layout(homework.id, changed));
                      }
                    : undefined
                }
              />
            )}
            {!frozen && (
              <div className="hw-recognize">
                <label>
                  Текст для распознавания
                  <textarea
                    value={source}
                    rows={6}
                    maxLength={30000}
                    disabled={!writable}
                    onChange={(event) => setSource(event.target.value)}
                    placeholder="Разделяйте задания пустой строкой"
                  />
                </label>
                <p className="dp-caption">
                  Проверьте, что имя ученика скрыто на каждой странице. Результат ИИ потребуется
                  сверить
                </p>
                <button
                  disabled={
                    !writable ||
                    (!source.trim() && !homework.files.length) ||
                    job.data?.status === "queued"
                  }
                  onClick={() => recognize.mutate()}
                >
                  {recognize.isPending || job.data?.status === "queued"
                    ? "Распознаём условия…"
                    : "Распознать условия"}
                </button>
              </div>
            )}
            {job.data?.status === "ready" &&
              job.data.kind === "condition_recognition" &&
              params.get("applied") !== job.data.id && (
                <div role="status">
                  <p>Черновик условий готов</p>
                  <button
                    disabled={
                      !writable || frozen || dirty || job.data.revision !== homework.revision
                    }
                    onClick={applyRecognition}
                  >
                    Добавить распознанные задания
                  </button>
                  {job.data.revision !== homework.revision && (
                    <p>ДЗ изменено после начала распознавания. Запустите его ещё раз</p>
                  )}
                </div>
              )}
            {job.data && ["failed", "needs_input", "stale"].includes(job.data.status) && (
              <p role="status">
                {job.data.status === "stale"
                  ? "ДЗ изменено после начала распознавания. Запустите его ещё раз"
                  : "Не удалось прочитать условия. Файлы сохранены: уточните оригинал или перепишите условие вручную"}
              </p>
            )}
          </section>
          <div className="hw-tasks" hidden={stage === "source"}>
            <p className="dp-caption">
              Подтверждено {completed} из {tasks.length}
            </p>
            {!tasks.length && (
              <p className="hw-empty">Добавьте задание вручную или распознайте условия</p>
            )}
            {tasks.map((task) => (
              <HomeworkTaskEditor
                key={task.id}
                task={task}
                files={homework.files}
                change={update}
                remove={() => setTasks(tasks.filter((item) => item.id !== task.id))}
                disabled={frozen || !writable}
              />
            ))}
            {!frozen && (
              <button
                disabled={!writable || tasks.length >= 100}
                onClick={() => setTasks([...tasks, newHomeworkTask()])}
              >
                Добавить задание
              </button>
            )}
          </div>
        </div>
      )}
      {!frozen && stage === "source" && (
        <div className="hw-actions">
          <p className="dp-caption">Распознайте условия или заполните задания вручную</p>
          <button onClick={() => goStage("review")}>Сверить задания</button>
        </div>
      )}
      {!frozen && stage === "review" && (
        <div className="hw-actions">
          <p className="dp-caption">
            {completed === tasks.length && tasks.length
              ? "Все условия подтверждены. Сохраните черновик и выберите учеников"
              : "Подтвердите каждое условие после сверки с оригиналом"}
          </p>
          <button onClick={() => goStage("assign")}>К назначению</button>
        </div>
      )}
    </>
  );
}
