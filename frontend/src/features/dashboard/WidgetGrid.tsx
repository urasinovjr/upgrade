import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { ArrowDown, ArrowUp, GripVertical, X } from "lucide-react";
import {
  moveBy,
  moveWidget,
  removeWidget,
  resizeHeight,
  resizeWidget,
  widgetSpans,
  type Breakpoint,
  type DashboardLayout,
  type LayoutItem,
  type PlacedWidget,
  type Span,
  type WidgetId,
} from "../../domain/dashboardLayout";
import { widgets } from "./widgets";
import type { LayoutEditor } from "./useLayoutEditor";

const spanLabels: Record<Span, string> = {
  3: "¼ ширины",
  4: "⅓ ширины",
  6: "½ ширины",
  8: "⅔ ширины",
  9: "¾ ширины",
  12: "Вся ширина",
};
const title = (id: unknown) => widgets[id as WidgetId]?.title ?? String(id);
const placeLabel = (items: LayoutItem[], id: unknown) => {
  const index = items.findIndex((item) => item.id === id);
  return `место ${index + 1} из ${items.length}`;
};
const arrowSteps: Record<string, -1 | 1> = {
  ArrowUp: -1,
  ArrowLeft: -1,
  ArrowDown: 1,
  ArrowRight: 1,
};
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
};
const noShift = () => null;

type Focus = { id: WidgetId; action: "up" | "down" | "handle" | "first" };
type Axis = "x" | "y" | "xy";
const heightPresets = [160, 240, 320, 400, 480, 560, 640];

export function WidgetGrid({
  placed,
  editor,
  breakpoint,
  arrive,
  announce,
  render,
}: {
  placed: PlacedWidget[];
  editor: LayoutEditor;
  breakpoint: Breakpoint;
  arrive: boolean;
  announce: (message: string) => void;
  render: (id: WidgetId) => ReactNode;
}) {
  const { editing, layout } = editor;
  const [active, setActive] = useState<WidgetId>();
  const before = useRef<DashboardLayout>(undefined);
  const swapped = useRef<string>(undefined);
  const grid = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<Focus>(undefined);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const position = (id: unknown) => placeLabel(layout.items, id);
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Виджет «${title(active.id)}» взят, ${position(active.id)}.`,
    onDragOver: ({ active }) => `«${title(active.id)}»: ${position(active.id)}.`,
    onDragEnd: ({ active }) => `«${title(active.id)}» поставлен на ${position(active.id)}.`,
    onDragCancel: ({ active }) => `Перенос «${title(active.id)}» отменён.`,
  };

  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = undefined;
    const frame = grid.current?.querySelector(`[data-widget="${target.id}"]`);
    const controls = [
      ...(frame?.querySelectorAll<HTMLButtonElement>(".dp-widget-tools button") ?? []),
    ].filter((button) => !button.disabled && button.getClientRects().length);
    const preferred = controls.find((button) => button.dataset.action === target.action);
    (preferred ?? controls[0])?.focus();
  });

  const move = (id: WidgetId, delta: -1 | 1, from: Focus["action"]) => {
    const next = moveBy(layout, id, delta);
    if (next === layout) return;
    pendingFocus.current = { id, action: from };
    editor.apply(() => next);
    announce(`«${title(id)}»: ${placeLabel(next.items, id)}.`);
  };
  const remove = (id: WidgetId) => {
    const index = layout.items.findIndex((item) => item.id === id);
    const neighbour = layout.items[index + 1] ?? layout.items[index - 1];
    if (neighbour) pendingFocus.current = { id: neighbour.id, action: "first" };
    editor.apply((current) => removeWidget(current, id));
    announce(`«${title(id)}» убран с обзора. Вернуть его можно через «Добавить виджет».`);
    if (!neighbour) document.querySelector<HTMLElement>(".dp-layout-add")?.focus();
  };
  const resize = (id: WidgetId, columns: number) =>
    editor.apply((current) => resizeWidget(current, id, columns));

  const onDragStart = ({ active }: DragStartEvent) => {
    before.current = layout;
    swapped.current = undefined;
    setActive(active.id as WidgetId);
  };
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || over.id === active.id) {
      swapped.current = undefined;
      return;
    }
    if (over.id === swapped.current) return;
    swapped.current = String(over.id);
    editor.apply((current) =>
      moveWidget(
        current,
        active.id as WidgetId,
        current.items.findIndex((item) => item.id === over.id),
      ),
    );
  };
  const onDragCancel = () => {
    const original = before.current;
    if (original) editor.apply(() => original);
    setActive(undefined);
  };

  const ActiveIcon = active && widgets[active].Icon;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "Перетащите виджет мышью или стрелками переставьте его на место раньше или позже.",
        },
      }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={() => setActive(undefined)}
      onDragCancel={onDragCancel}
    >
      <SortableContext items={placed.map(({ id }) => id)} strategy={noShift}>
        <div
          ref={grid}
          className="dp-widget-grid"
          data-arrive={arrive || undefined}
          data-editing={editing || undefined}
          data-breakpoint={breakpoint}
        >
          {placed.map((item) => {
            const index = layout.items.findIndex(({ id }) => id === item.id);
            return (
              <Widget
                key={item.id}
                item={item}
                editing={editing}
                wide={breakpoint === "wide"}
                stored={layout.items[index]?.span}
                first={index === 0}
                last={index === layout.items.length - 1}
                onMove={(delta, from) => move(item.id, delta, from)}
                onRemove={() => remove(item.id)}
                onResize={(columns) => resize(item.id, columns)}
                onResizeHeight={(pixels) =>
                  editor.apply((current) => resizeHeight(current, item.id, pixels))
                }
                onResized={(axis) => {
                  const stored = layout.items[index];
                  if (!stored) return;
                  const parts = [
                    axis !== "y" && spanLabels[stored.span].toLowerCase(),
                    axis !== "x" &&
                      (stored.height ? `высота ${stored.height} px` : "высота по содержимому"),
                  ].filter(Boolean);
                  announce(`«${title(item.id)}»: ${parts.join(", ")}.`);
                }}
              >
                {render(item.id)}
              </Widget>
            );
          })}
        </div>
      </SortableContext>
      {createPortal(
        <DragOverlay dropAnimation={reducedMotion() ? null : undefined}>
          {active && ActiveIcon && (
            <div className="dp-widget-overlay">
              <GripVertical size={16} aria-hidden="true" />
              <ActiveIcon size={16} aria-hidden="true" />
              {title(active)}
            </div>
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

function Widget({
  item,
  editing,
  wide,
  stored,
  first,
  last,
  onMove,
  onRemove,
  onResize,
  onResizeHeight,
  onResized,
  children,
}: {
  item: PlacedWidget;
  editing: boolean;
  wide: boolean;
  stored?: Span;
  first: boolean;
  last: boolean;
  onMove: (delta: -1 | 1, from: Focus["action"]) => void;
  onRemove: () => void;
  onResize: (columns: number) => void;
  onResizeHeight: (pixels: number | undefined) => void;
  onResized: (axis: Axis) => void;
  children: ReactNode;
}) {
  const { id, height } = item;
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useSortable({
    id,
    disabled: !editing,
    attributes: { roleDescription: "перемещаемый виджет" },
  });
  const { title: name, Icon, divider } = widgets[id];
  const heights =
    height && !heightPresets.includes(height) ? [...heightPresets, height] : heightPresets;
  return (
    <div
      ref={setNodeRef}
      className="dp-widget"
      data-widget={id}
      data-span={stored}
      data-height={height}
      data-dragging={isDragging || undefined}
      data-divider={(!editing && divider && !item.rowStart) || undefined}
      style={{ "--span": item.span, "--height": height && height + "px" } as CSSProperties}
    >
      {editing && (
        <div className="dp-widget-tools" role="group" aria-label={`Виджет «${name}»`}>
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className="dp-icon dp-widget-handle"
            data-action="handle"
            aria-label={`Переместить «${name}»`}
            onKeyDown={(event) => {
              const delta = arrowSteps[event.key];
              if (!delta) return;
              event.preventDefault();
              onMove(delta, "handle");
            }}
          >
            <GripVertical size={16} aria-hidden="true" />
          </button>
          <span className="dp-widget-name">
            <Icon size={14} aria-hidden="true" />
            <span>{name}</span>
          </span>
          {wide && stored && (
            <span className="dp-widget-sizes">
              <select
                className="dp-widget-size"
                aria-label={`Ширина «${name}»`}
                value={stored}
                onChange={(event) => onResize(Number(event.target.value))}
              >
                {widgetSpans[id].allowed.map((span) => (
                  <option key={span} value={span}>
                    {spanLabels[span]}
                  </option>
                ))}
              </select>
              <select
                className="dp-widget-size"
                aria-label={`Высота «${name}»`}
                value={height ?? ""}
                onChange={(event) =>
                  onResizeHeight(event.target.value ? Number(event.target.value) : undefined)
                }
              >
                <option value="">По содержимому</option>
                {heights.map((value) => (
                  <option key={value} value={value}>
                    {value} px
                  </option>
                ))}
              </select>
            </span>
          )}
          <button
            className="dp-icon"
            data-action="up"
            aria-label={`Поднять «${name}»`}
            disabled={first}
            onClick={() => onMove(-1, "up")}
          >
            <ArrowUp size={16} aria-hidden="true" />
          </button>
          <button
            className="dp-icon"
            data-action="down"
            aria-label={`Опустить «${name}»`}
            disabled={last}
            onClick={() => onMove(1, "down")}
          >
            <ArrowDown size={16} aria-hidden="true" />
          </button>
          <button className="dp-icon" aria-label={`Убрать «${name}»`} onClick={onRemove}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="dp-widget-body" inert={editing}>
        <div className="dp-widget-content">{children}</div>
      </div>
      {editing &&
        wide &&
        (["x", "y", "xy"] as const).map((axis) => (
          <ResizeGrip
            key={axis}
            axis={axis}
            onResize={onResize}
            onResizeHeight={onResizeHeight}
            onResized={() => onResized(axis)}
          />
        ))}
    </div>
  );
}

const gripTitles: Record<Axis, string> = {
  x: "Потяните, чтобы изменить ширину",
  y: "Потяните, чтобы изменить высоту. Двойной щелчок — по содержимому",
  xy: "Потяните, чтобы изменить ширину и высоту. Двойной щелчок — высота по содержимому",
};

function ResizeGrip({
  axis,
  onResize,
  onResizeHeight,
  onResized,
}: {
  axis: Axis;
  onResize: (columns: number) => void;
  onResizeHeight: (pixels: number | undefined) => void;
  onResized: () => void;
}) {
  const drag = useRef<{ left: number; pitch: number; gap: number; top: number; height: number }>(
    undefined,
  );
  const start = (event: PointerEvent<HTMLDivElement>) => {
    const frame = event.currentTarget.parentElement;
    const grid = frame?.parentElement;
    const body = frame?.querySelector(".dp-widget-body");
    if (!frame || !grid || !body || event.button !== 0) return;
    event.preventDefault();
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
    const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    const column = (grid.getBoundingClientRect().width - gap * (columns - 1)) / columns;
    drag.current = {
      left: frame.getBoundingClientRect().left,
      pitch: column + gap,
      gap,
      top: event.clientY,
      height: body.getBoundingClientRect().height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const track = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    if (axis !== "y") onResize((event.clientX - current.left + current.gap) / current.pitch);
    if (axis !== "x") onResizeHeight(current.height + event.clientY - current.top);
  };
  const stop = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = undefined;
    event.currentTarget.releasePointerCapture(event.pointerId);
    onResized();
  };
  return (
    <div
      className="dp-widget-resize"
      data-axis={axis}
      aria-hidden="true"
      title={gripTitles[axis]}
      onPointerDown={start}
      onPointerMove={track}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={axis === "x" ? undefined : () => onResizeHeight(undefined)}
    />
  );
}
