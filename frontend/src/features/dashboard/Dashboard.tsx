import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router";
import {
  LayoutDashboard,
  LoaderCircle,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { deriveDashboard } from "../../domain/dashboard";
import {
  addWidget,
  arrangeWidgets,
  availableWidgets,
  defaultLayout,
  isDefaultLayout,
  type Breakpoint,
  type DashboardLayout,
  type WidgetId,
} from "../../domain/dashboardLayout";
import { topics } from "../../data/fixtures";
import { useDashboardLayout, useStore } from "../../shared/query";
import { Modal, PageBar, PageLoading, PageState } from "../../shared/ui";
import { errorText } from "../../shared/text";
import { useMediaQuery } from "../../shared/useMediaQuery";
import {
  chartFilterPatch,
  revealQueue,
  useQueueFilters,
  worksLink,
} from "../works/useQueueFilters";
import { useQuickUpload, type QuickUpload } from "../works/useQuickUpload";
import { useLayoutEditor } from "./useLayoutEditor";
import { WidgetCatalog } from "./WidgetCatalog";
import { WidgetGrid } from "./WidgetGrid";
import { widgets, type WidgetContext } from "./widgets";
import "./dashboard.css";
import "./widgets.css";

const editHints: Record<Breakpoint, string> = {
  wide: "Перетащите виджет за ручку. Размер меняйте за край или угол рамки либо в списках; виджеты одного ряда выравниваются по самому высокому.",
  narrow: "Меняйте порядок кнопками со стрелками.",
  medium: "Перетащите виджет за ручку. Ширина настраивается на широком экране.",
};

function UploadButton({ upload }: { upload: QuickUpload }) {
  return (
    <label className={"dp-primary dp-upload-button" + (upload.busy ? " is-busy" : "")}>
      {upload.busy ? (
        <LoaderCircle className="dp-spin" size={16} aria-hidden="true" />
      ) : (
        <Upload size={16} aria-hidden="true" />
      )}
      <span>Загрузить работу</span>
      <input
        type="file"
        multiple
        accept="image/jpeg,image/png,application/pdf"
        className="dp-visually-hidden"
        aria-label="Быстрая загрузка решения"
        disabled={upload.busy}
        onChange={(event) => {
          void upload.addFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </label>
  );
}

function LayoutSkeleton({
  layout,
  breakpoint,
}: {
  layout: DashboardLayout;
  breakpoint: Breakpoint;
}) {
  if (isDefaultLayout(layout)) return <PageLoading variant="dashboard" />;
  return (
    <PageLoading>
      <div className="dp-widget-grid" data-breakpoint={breakpoint}>
        {arrangeWidgets(layout, breakpoint, { editing: false }).map(({ id, span }) => (
          <div
            key={id}
            className="dp-sk dp-widget"
            style={{ "--span": span, height: widgets[id].skeletonHeight } as CSSProperties}
          />
        ))}
      </div>
    </PageLoading>
  );
}

export default function Dashboard() {
  const query = useStore();
  const layoutQuery = useDashboardLayout();
  const { filters, update } = useQueueFilters();
  const upload = useQuickUpload();
  const navigate = useNavigate();
  const queueRef = useRef<HTMLElement>(null);
  const customizeRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const editor = useLayoutEditor(layoutQuery.data ?? defaultLayout());
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [arrive, setArrive] = useState(true);
  const wide = useMediaQuery("(min-width: 1200px)");
  const narrow = useMediaQuery("(max-width: 700px)");
  const breakpoint: Breakpoint = wide ? "wide" : narrow ? "narrow" : "medium";

  const wasEditing = useRef(false);
  useEffect(() => {
    if (editor.editing && !wasEditing.current) barRef.current?.focus({ preventScroll: true });
    if (!editor.editing && wasEditing.current) customizeRef.current?.focus({ preventScroll: true });
    wasEditing.current = editor.editing;
  }, [editor.editing]);

  const start = () => {
    setArrive(false);
    setAnnouncement("");
    editor.start();
  };
  const finish = () => {
    void editor
      .commit()
      .then(() => setAnnouncement("Расположение обзора сохранено."))
      .catch(() => {});
  };
  const add = (id: WidgetId) => {
    editor.apply((layout) => addWidget(layout, id));
    setCatalogOpen(false);
    setAnnouncement(`«${widgets[id].title}» добавлен в конец обзора.`);
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-widget="${id}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "auto" }),
    );
  };

  const bar = (
    <PageBar
      actions={
        editor.editing ? (
          <>
            <button onClick={editor.cancel} disabled={editor.saving}>
              Отмена
            </button>
            <button className="dp-primary" onClick={finish} disabled={editor.saving}>
              {editor.saving && <LoaderCircle className="dp-spin" size={16} aria-hidden="true" />}
              Готово
            </button>
          </>
        ) : (
          <>
            <button ref={customizeRef} className="dp-compact-action" onClick={start}>
              <SlidersHorizontal size={16} aria-hidden="true" />
              <span>Настроить</span>
            </button>
            <UploadButton upload={upload} />
          </>
        )
      }
    />
  );
  if (query.isPending || layoutQuery.isPending)
    return (
      <>
        {bar}
        {layoutQuery.data ? (
          <LayoutSkeleton layout={layoutQuery.data} breakpoint={breakpoint} />
        ) : (
          <PageLoading variant="dashboard" />
        )}
      </>
    );
  if (!query.data)
    return <PageState title="Обзор" error={query.error} retry={() => void query.refetch()} />;
  const state = query.data;
  const { layout } = editor;
  const placed = arrangeWidgets(layout, breakpoint, {
    editing: editor.editing,
    visible: (id) => !widgets[id].hiddenWhen?.(state),
  });
  const hasQueue = placed.some(({ id }) => id === "queue");
  const context: WidgetContext = {
    state,
    summary: deriveDashboard(state, topics),
    filters,
    update,
    upload,
    queueRef,
    onChartChange: (value) => {
      if (hasQueue) {
        update(chartFilterPatch(value));
        revealQueue(queueRef.current);
      } else {
        void navigate(worksLink(chartFilterPatch(value)));
      }
    },
  };
  const available = availableWidgets(layout);
  const stayOnPage = () => {
    if (editor.blocker.state === "blocked") editor.blocker.reset();
  };
  const leavePage = () => {
    if (editor.blocker.state === "blocked") editor.blocker.proceed();
  };
  return (
    <>
      {bar}
      <div className="dp-page dp-overview" data-editing={editor.editing || undefined}>
        <h1 className="dp-visually-hidden">Обзор</h1>
        <p className="dp-visually-hidden" role="status">
          {announcement}
        </p>
        {editor.editing && (
          <div
            ref={barRef}
            className="dp-layout-bar"
            role="region"
            aria-label="Настройка обзора"
            tabIndex={-1}
          >
            <p>
              <strong>Настройка обзора</strong>
              <span>{editHints[breakpoint]}</span>
            </p>
            <div className="dp-layout-actions">
              <button
                className="dp-layout-add"
                onClick={() => setCatalogOpen(true)}
                disabled={!available.length}
              >
                <Plus size={16} aria-hidden="true" />
                Добавить виджет
              </button>
              <button
                onClick={() => {
                  editor.reset();
                  setAnnouncement("Восстановлен исходный вид обзора.");
                }}
                disabled={isDefaultLayout(layout)}
              >
                <RotateCcw size={16} aria-hidden="true" />
                Исходный вид
              </button>
            </div>
            {Boolean(editor.error) && (
              <p className="dp-error" role="alert">
                Не удалось сохранить расположение.{" "}
                {editor.error instanceof Error ? editor.error.message : ""}
              </p>
            )}
          </div>
        )}
        {placed.length ? (
          <WidgetGrid
            placed={placed}
            editor={editor}
            breakpoint={breakpoint}
            arrive={arrive}
            announce={setAnnouncement}
            render={(id) => widgets[id].render(context)}
          />
        ) : editor.editing ? (
          <button className="dp-layout-empty" onClick={() => setCatalogOpen(true)}>
            <Plus size={16} aria-hidden="true" />
            Добавьте первый виджет
          </button>
        ) : (
          <div className="dp-empty">
            <LayoutDashboard size={32} aria-hidden="true" />
            <h2>На обзоре нет виджетов</h2>
            <p>Выберите, что показывать: очередь, сводку, графики или списки учеников.</p>
            <button onClick={start}>
              <SlidersHorizontal size={16} aria-hidden="true" />
              Настроить обзор
            </button>
          </div>
        )}
      </div>
      <WidgetCatalog
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        available={available}
        onAdd={add}
      />
      <Modal
        open={editor.blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open) stayOnPage();
        }}
        title="Сохранить расположение?"
        description="Вы изменили обзор, но ещё не нажали «Готово»."
      >
        {Boolean(editor.error) && (
          <p className="dp-error" role="alert">
            {errorText(editor.error)}
          </p>
        )}
        <div className="dp-dialog-actions">
          <button onClick={stayOnPage}>Остаться</button>
          <button
            onClick={() => {
              editor.cancel();
              leavePage();
            }}
          >
            Не сохранять
          </button>
          <button
            className="dp-primary"
            onClick={() => {
              void editor
                .commit()
                .then(leavePage)
                .catch(() => {});
            }}
          >
            Сохранить и перейти
          </button>
        </div>
      </Modal>
    </>
  );
}
