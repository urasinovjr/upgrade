import { useState, type DragEvent, type Ref } from "react";
import { Link } from "react-router";
import { AlertCircle, ArrowRight, ChevronRight, LoaderCircle, Search, Upload } from "lucide-react";
import type { StoreState, Work, WorkStatus } from "../../domain/models";
import { inQueueView, matchesActivity, sortQueue, type QueueView } from "../../domain/analytics";
import { currentRevision } from "../../domain/review";
import { statusMeta } from "../../shared/status";
import { Badge } from "../../shared/ui";
import { date, dayLabel, errorText } from "../../shared/text";
import { ActiveFilter } from "./WorkInsights";
import type { QueueFilters, useQueueFilters } from "./useQueueFilters";
import type { QuickUpload } from "./useQuickUpload";
import "./works.css";

const hints: Partial<Record<WorkStatus, string>> = {
  needs_input: "Сверить с оригиналом",
  failed: "Открыть и проверить вручную",
};
const views: [QueueView, string][] = [
  ["attention", "Требуют внимания"],
  ["all", "Все"],
  ["confirmed", "Подтверждены"],
];
const previewLimit = 8;
const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

export function WorkQueue({
  state,
  mode,
  filters,
  update,
  upload: offeredUpload,
  autoFocusSearch,
  className = "",
  ref,
}: {
  state: StoreState;
  mode: "preview" | "full";
  filters: QueueFilters;
  update: ReturnType<typeof useQueueFilters>["update"];
  upload?: QuickUpload;
  autoFocusSearch?: boolean;
  className?: string;
  ref?: Ref<HTMLElement>;
}) {
  const [dragging, setDragging] = useState(false);
  const upload = offeredUpload?.allowed ? offeredUpload : undefined;
  const full = mode === "full";
  const students = new Map(state.students.map((student) => [student.id, student]));
  const { view } = filters;
  const search = filters.search.trim().toLowerCase();
  const student = full ? filters.student : "";
  const matchesSearch = (work: Work) => {
    const text = work.title + " " + (students.get(work.studentId)?.name ?? "");
    return text.toLowerCase().includes(search);
  };
  const matches = sortQueue(
    state.works.filter(
      (work) =>
        inQueueView(work, view) &&
        matchesActivity(work, filters) &&
        (!student || work.studentId === student) &&
        matchesSearch(work),
    ),
  );
  const shown = full ? matches : matches.slice(0, previewLimit);
  const studentName = student && students.get(student)?.name;
  const parts = [
    search && "«" + filters.search.trim() + "»",
    studentName,
    filters.day && dayLabel(filters.day),
    filters.status && statusMeta[filters.status].label,
  ].filter((part): part is string => Boolean(part));
  const clearedFilters = {
    search: undefined,
    student: undefined,
    status: undefined,
    day: undefined,
  };
  const resetFilters = () => update(clearedFilters);
  const showAll = () => update({ view: "all", ...clearedFilters });
  const fullLink =
    "/works?" +
    new URLSearchParams({
      ...(view !== "attention" && { view }),
      ...(search && { search: filters.search.trim() }),
      ...(filters.day && { day: filters.day }),
      ...(filters.status && { status: filters.status }),
    });
  const titleId = full ? "works-title" : "queue-title";
  const Heading = full ? "h1" : "h2";
  const searchField = (
    <label className="dp-search">
      <Search size={14} aria-hidden="true" />
      <input
        aria-label="Поиск работ"
        placeholder="Найти работу"
        autoFocus={autoFocusSearch}
        value={filters.search}
        onChange={(event) => update({ search: event.target.value })}
      />
    </label>
  );

  return (
    <section
      ref={ref}
      className={"dp-queue " + className}
      aria-labelledby={titleId}
      data-dragging={dragging}
      onDragEnter={(event) => {
        if (upload && hasFiles(event)) setDragging(true);
      }}
      onDragOver={(event) => {
        if (!upload || !hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!upload) return;
        event.preventDefault();
        setDragging(false);
        void upload.addFiles(event.dataTransfer.files);
      }}
    >
      <div className="dp-viewbar">
        <div className="dp-viewbar-head">
          <Heading id={titleId}>Работы</Heading>
          {!!state.works.length && searchField}
        </div>
        {!!state.works.length && (
          <div className="dp-viewbar-filters">
            <div className="dp-segment" role="group" aria-label="Фильтр работ">
              {views.map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={view === value}
                  onClick={() => update({ view: value, status: undefined })}
                >
                  {label}
                  <span className="dp-segment-count">
                    {state.works.filter((work) => inQueueView(work, value)).length}
                  </span>
                </button>
              ))}
            </div>
            {full && (
              <div className="dp-queue-selects">
                <select
                  aria-label="Ученик"
                  value={filters.student}
                  onChange={(event) => update({ student: event.target.value })}
                >
                  <option value="">Все ученики</option>
                  {state.students.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Статус"
                  value={filters.status ?? ""}
                  onChange={(event) =>
                    update({
                      status: event.target.value,
                      ...(event.target.value && { view: "all" }),
                    })
                  }
                >
                  <option value="">Все статусы</option>
                  {Object.entries(statusMeta).map(([value, { label }]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>
      <ActiveFilter parts={parts} onReset={resetFilters} />
      {upload?.busy && (
        <p className="dp-queue-note" role="status">
          <LoaderCircle className="dp-spin" size={14} aria-hidden="true" />
          Проверяем файлы…
        </p>
      )}
      {!!upload?.error && (
        <p className="dp-queue-alert" role="alert">
          <AlertCircle size={14} aria-hidden="true" />
          {errorText(upload.error)}
        </p>
      )}
      <div className="dp-work-list">
        {shown.map((work) => {
          const { label, tone, Icon } = statusMeta[work.status];
          const owner = students.get(work.studentId);
          const hint = hints[work.status];
          return (
            <Link key={work.id} to={"/works/" + work.id} className="dp-work-row work-row">
              <span className={"dp-work-status dp-tone-" + tone} title={label}>
                <Icon size={16} aria-hidden="true" />
                {!hint && <span className="dp-visually-hidden">{label}:</span>}
              </span>
              <span className="dp-work-main work-name">
                <strong className="dp-work-title">{work.title}</strong>
                {owner && (
                  <span className="dp-work-student">
                    {owner.name} · {owner.grade} кл.
                  </span>
                )}
              </span>
              <span className="dp-work-meta">
                {hint ? (
                  <span className="dp-work-flag" title={hint}>
                    <span className="dp-work-hint">{hint}</span>
                    <Badge status={work.status} />
                  </span>
                ) : (
                  work.editing &&
                  currentRevision(work) && (
                    <span
                      className="dp-work-revision"
                      title="Идёт работа над новой версией, подтверждённая остаётся в силе"
                    >
                      Новая версия
                    </span>
                  )
                )}
                <time dateTime={work.createdAt}>{date(work.createdAt)}</time>
              </span>
              <ChevronRight className="dp-work-chevron" size={16} aria-hidden="true" />
            </Link>
          );
        })}
        {!full && matches.length > shown.length && (
          <Link className="dp-queue-rest" to={fullLink}>
            Ещё {matches.length - shown.length} в списке работ
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        )}
        {!matches.length && (
          <div className="dp-queue-empty">
            {!state.works.length ? (
              <>
                <Upload size={16} aria-hidden="true" />
                <span>
                  <strong>{full ? "Работ пока нет" : "Добавьте первую работу"}</strong>
                  {!full && upload && (
                    <small>Перетащите решение сюда или нажмите «Загрузить работу».</small>
                  )}
                </span>
                {full && (
                  <Link className="dp-text" to="/works/new">
                    Добавить первую работу
                  </Link>
                )}
              </>
            ) : (
              <>
                <Search size={16} aria-hidden="true" />
                <span>
                  {view === "attention" && !parts.length
                    ? "Все работы проверены"
                    : "Работы не найдены"}
                </span>
                <button className="dp-text" onClick={showAll}>
                  Показать все
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {upload && (
        <div className="dp-drop-overlay dropzone" aria-hidden="true">
          <Upload size={20} />
          <strong>Отпустите файлы, чтобы добавить работу</strong>
          <small>JPG, PNG или PDF · до 20 МБ на файл</small>
        </div>
      )}
    </section>
  );
}
