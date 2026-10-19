import { useEffect, useRef, useState } from "react";
import {
  useNavigate,
  useBlocker,
  useLocation,
  useBeforeUnload,
  useSearchParams,
} from "react-router";
import {
  ArrowRight,
  Eye,
  FileText,
  Info,
  LoaderCircle,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import type { Task, Upload as StagedUpload, Work } from "../../domain/models";
import { blankTask } from "../../domain/review";
import { gateway } from "../../data/gateway";
import { useCommand, useStore } from "../../shared/query";
import { Callout, ErrorMessage, Modal, PageLoading, PageState, Panel } from "../../shared/ui";
import { FormulaInput } from "../../shared/math";
import { MediaViewer } from "../../shared/MediaViewer";
import { StudentForm } from "../students/StudentForm";
import { decodeUpload } from "../../shared/uploads";
import { clearStagedUploads, readStagedUploads } from "../../shared/uploadHandoff";
import "./new-work.css";

export default function NewWork() {
  const query = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const command = useCommand();
  const token = typeof location.state?.uploadToken === "string" ? location.state.uploadToken : "";
  const [incoming] = useState(() => (token ? readStagedUploads(token) : undefined));
  const [params] = useSearchParams();
  const preset = params.get("student") ?? "";
  const [studentId, setStudentId] = useState(preset);
  const [title, setTitle] = useState("");
  const [uploads, setUploads] = useState<StagedUpload[]>(incoming || []);
  const [tasks, setTasks] = useState<Task[]>(() => [blankTask(1)]);
  const [error, setError] = useState<unknown>();
  const [errorAt, setErrorAt] = useState<"details" | "solution" | "conditions">("solution");
  const studentSelect = useRef<HTMLSelectElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const solutionInput = useRef<HTMLInputElement>(null);
  const conditionsPanel = useRef<HTMLElement>(null);
  const [decoding, setDecoding] = useState(false);
  const [studentModal, setStudentModal] = useState(false);
  const submitted = useRef(false);
  const dirty = Boolean(
    title ||
    uploads.length ||
    studentId !== preset ||
    tasks.length !== 1 ||
    tasks.some(
      (task) =>
        task.condition || task.formula || task.reference || task.conditionAttachmentIds?.length,
    ),
  );
  const blocker = useBlocker(() => !submitted.current && dirty);
  useBeforeUnload((event) => {
    if (!submitted.current && dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  useEffect(() => {
    if (token) clearStagedUploads(token);
  }, [token]);
  const addFiles = async (files: FileList | null, taskId?: string) => {
    if (!files?.length || decoding) return;
    setDecoding(true);
    setError(undefined);
    setErrorAt(taskId ? "conditions" : "solution");
    try {
      const decoded = await Promise.all(Array.from(files).map(decodeUpload));
      setUploads((previous) => [...previous, ...decoded]);
      if (taskId)
        setTasks((previous) =>
          previous.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  conditionAttachmentIds: [
                    ...(task.conditionAttachmentIds || []),
                    ...decoded.map((file) => file.id),
                  ],
                }
              : task,
          ),
        );
    } catch (cause) {
      setError(cause);
    } finally {
      setDecoding(false);
    }
  };
  if (query.isPending) return <PageLoading variant="form" />;
  if (!query.data)
    return (
      <PageState title="Новая работа" error={query.error} retry={() => void query.refetch()} />
    );
  const selectedStudent = query.data.students.some((item) => item.id === studentId)
    ? studentId
    : "";
  const conditionFiles = new Set(tasks.flatMap((task) => task.conditionAttachmentIds || []));
  const change = (id: string, patch: Partial<Task>) =>
    setTasks((previous) => previous.map((task) => (task.id === id ? { ...task, ...patch } : task)));
  const showError = (message: string, at: typeof errorAt, target: HTMLElement | null) => {
    setError(new Error(message));
    setErrorAt(at);
    requestAnimationFrame(() => target?.focus());
  };
  const submit = () => {
    setError(undefined);
    if (!selectedStudent) {
      showError("Выберите ученика.", "details", studentSelect.current);
      return;
    }
    if (!title.trim()) {
      showError("Укажите название работы.", "details", titleInput.current);
      return;
    }
    if (!uploads.length) {
      showError("Добавьте решение ученика.", "solution", solutionInput.current);
      return;
    }
    if (uploads.every((file) => conditionFiles.has(file.id))) {
      showError(
        "Добавьте решение ученика отдельно от вложенного условия.",
        "solution",
        solutionInput.current,
      );
      return;
    }
    const missingCondition = tasks.some(
      (task) =>
        !task.condition.trim() && !task.formula.trim() && !task.conditionAttachmentIds?.length,
    );
    if (missingCondition) {
      showError(
        "Добавьте условие каждой задачи текстом, формулой или изображением.",
        "conditions",
        conditionsPanel.current?.querySelector("textarea") || null,
      );
      return;
    }
    const id = crypto.randomUUID();
    const work: Work = {
      id,
      studentId: selectedStudent,
      title: title.trim(),
      createdAt: new Date().toISOString(),
      demo: false,
      status: "preparation",
      editing: true,
      manual: true,
      published: [],
      attachments: uploads.map(({ blob, ...file }) => {
        void blob;
        return file;
      }),
      draft: { revision: 1, inputRevision: 0, analysedInputRevision: -1, tasks, feedback: "" },
    };
    command.mutate(() => gateway.create(work, uploads), {
      onSuccess: () => {
        submitted.current = true;
        navigate("/works/" + id);
      },
    });
  };
  const sectionError = (at: typeof errorAt) => (
    <ErrorMessage error={errorAt === at ? error : undefined} />
  );
  return (
    <div className="dp-page dp-new-work-page">
      <Panel
        title="Новая работа"
        className="dp-new-work"
        headerClassName="page-header"
        heading={
          <>
            <h1>Новая работа</h1>
            <span className="dp-window-meta">Шаг 1 · подготовка</span>
          </>
        }
        closeBlocked={dirty}
        onClose={() => navigate("/works")}
      >
        {token && !incoming && !uploads.length && (
          <Callout
            tone="info"
            role="status"
            icon={<Info size={16} aria-hidden="true" />}
            title="Файлы ещё не были сохранены в работе."
            more="После перезагрузки выберите их заново."
          />
        )}
        <div className="new-work-grid">
          <section className="dp-nw-section new-work-details" aria-labelledby="nw-details">
            <h2 id="nw-details">
              <span className="dp-nw-step">1</span>Ученик и работа
            </h2>
            <div className="dp-nw-field">
              <span className="dp-nw-label">Ученик</span>
              <div className="dp-nw-student">
                <select
                  ref={studentSelect}
                  aria-invalid={Boolean(error && errorAt === "details" && !selectedStudent)}
                  aria-label="Ученик"
                  value={selectedStudent}
                  onChange={(event) => setStudentId(event.target.value)}
                >
                  <option value="">Выберите ученика</option>
                  {query.data.students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name} · {student.grade} класс
                    </option>
                  ))}
                </select>
                <button className="dp-compact-action" onClick={() => setStudentModal(true)}>
                  <UserPlus size={16} aria-hidden="true" />
                  <span>Создать ученика</span>
                </button>
              </div>
            </div>
            <label>
              Название работы
              <input
                ref={titleInput}
                aria-invalid={Boolean(error && errorAt === "details" && !title.trim())}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Например, домашняя работа · 30 сентября"
              />
            </label>
            {sectionError("details")}
          </section>
          <section className="dp-nw-section new-work-upload" aria-labelledby="nw-solution">
            <h2 id="nw-solution">
              <span className="dp-nw-step">2</span>Решение ученика
            </h2>
            <label
              className={"dp-nw-drop" + (decoding ? " is-busy" : "")}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void addFiles(event.dataTransfer.files);
              }}
            >
              {decoding ? (
                <LoaderCircle className="dp-spin" size={20} aria-hidden="true" />
              ) : (
                <Upload size={20} aria-hidden="true" />
              )}
              <strong>{decoding ? "Проверяем файлы…" : "Добавьте фото или PDF решения"}</strong>
              <small>Перетащите файлы сюда или нажмите · JPG, PNG, PDF до 20 МБ на файл</small>
              <input
                ref={solutionInput}
                type="file"
                multiple
                accept="image/jpeg,image/png,application/pdf"
                aria-label="Загрузить решение"
                disabled={decoding}
                onChange={(event) => {
                  void addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
            {uploads.length > 0 && (
              <ul className="dp-nw-files" aria-label="Добавленные файлы">
                {uploads.map((file) => (
                  <li className="upload-row" key={file.id}>
                    <FileText size={16} aria-hidden="true" />
                    <span className="dp-nw-file-name">{file.name}</span>
                    <small>
                      {conditionFiles.has(file.id) ? "Условие · " : ""}
                      {file.pages} стр. · {Math.round(file.size / 1024)} КБ
                    </small>
                    <button
                      className="dp-icon"
                      aria-label={"Удалить " + file.name}
                      title="Удалить файл"
                      onClick={() => {
                        setUploads((previous) => previous.filter((item) => item.id !== file.id));
                        setTasks((previous) =>
                          previous.map((task) => ({
                            ...task,
                            conditionAttachmentIds: task.conditionAttachmentIds?.filter(
                              (id) => id !== file.id,
                            ),
                          })),
                        );
                      }}
                    >
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {sectionError("solution")}
          </section>
          <aside
            className={"dp-nw-preview preview-panel" + (!uploads.length ? " preview-empty" : "")}
            aria-label="Оригинал"
          >
            <MediaViewer
              files={uploads}
              uploads={uploads}
              lead={
                <span className="dp-nw-preview-title">
                  <Eye size={16} aria-hidden="true" />
                  Оригинал
                </span>
              }
              update={(files) =>
                setUploads((previous) =>
                  files.map((file) => ({
                    ...file,
                    blob: previous.find((item) => item.id === file.id)!.blob,
                  })),
                )
              }
            />
          </aside>
          <section
            className="dp-nw-section new-work-conditions"
            ref={conditionsPanel}
            aria-labelledby="nw-conditions"
          >
            <h2 id="nw-conditions">
              <span className="dp-nw-step">3</span>Условия задач
            </h2>
            <p className="dp-nw-hint">Каждая задача отдельно. Эталонный ответ необязателен.</p>
            {tasks.map((task, index) => (
              <article className="dp-nw-task condition-card" key={task.id}>
                <header>
                  <h3>{task.title}</h3>
                  {tasks.length > 1 && (
                    <button
                      className="dp-icon"
                      aria-label={"Удалить задачу " + (index + 1)}
                      title="Удалить задачу"
                      onClick={() =>
                        setTasks((previous) => previous.filter((item) => item.id !== task.id))
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </header>
                <label>
                  Условие текстом
                  <textarea
                    value={task.condition}
                    onChange={(event) => change(task.id, { condition: event.target.value })}
                    placeholder="Решите уравнение…"
                  />
                </label>
                <label>
                  Формула
                  <FormulaInput
                    label={"Условие задачи " + (index + 1)}
                    value={task.formula}
                    onChange={(value) => change(task.id, { formula: value })}
                  />
                </label>
                <label className="dp-nw-attach">
                  <Paperclip size={16} aria-hidden="true" />
                  <span>Прикрепить условие · фото или PDF</span>
                  <input
                    aria-label={"Прикрепить условие задачи " + (index + 1)}
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    disabled={decoding}
                    onChange={(event) => void addFiles(event.target.files, task.id)}
                  />
                </label>
                {task.conditionAttachmentIds?.length ? (
                  <p className="dp-nw-hint">
                    Условие:{" "}
                    {uploads
                      .filter((file) => task.conditionAttachmentIds?.includes(file.id))
                      .map((file) => file.name)
                      .join(", ")}
                  </p>
                ) : null}
                <label>
                  <span>
                    Эталонный ответ <span className="dp-nw-optional">необязательно</span>
                  </span>
                  <FormulaInput
                    label={"Эталон задачи " + (index + 1)}
                    value={task.reference}
                    onChange={(value) => change(task.id, { reference: value })}
                  />
                </label>
              </article>
            ))}
            <button
              className="dp-nw-add"
              onClick={() => setTasks((previous) => [...previous, blankTask(previous.length + 1)])}
            >
              <Plus size={16} aria-hidden="true" />
              Добавить задачу
            </button>
            {sectionError("conditions")}
          </section>
          <footer className="dp-nw-footer new-work-submit">
            <ErrorMessage error={command.error} />
            <p>Дальше — разбор: сверьте шаги с оригиналом и подтвердите работу.</p>
            <button
              className="dp-primary"
              disabled={command.isPending || decoding}
              onClick={submit}
            >
              {command.isPending ? "Сохраняем…" : "Создать работу и открыть разбор"}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </footer>
        </div>
      </Panel>
      <StudentForm
        open={studentModal}
        onClose={() => setStudentModal(false)}
        onSaved={setStudentId}
      />
      <Modal
        open={blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.state === "blocked") blocker.reset();
        }}
        title="Выйти из новой работы?"
        description="Работа ещё не создана. Добавленные файлы и условия будут потеряны."
      >
        <div className="dp-dialog-actions">
          <button onClick={() => blocker.state === "blocked" && blocker.reset()}>
            Продолжить заполнение
          </button>
          <button
            className="dp-destructive"
            onClick={() => blocker.state === "blocked" && blocker.proceed()}
          >
            Выйти
          </button>
        </div>
      </Modal>
    </div>
  );
}
