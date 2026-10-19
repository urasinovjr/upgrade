export type WidgetId =
  | "kpis"
  | "queue"
  | "focus"
  | "activity"
  | "status"
  | "roster"
  | "topicErrors"
  | "events"
  | "reviewSpeed"
  | "closures"
  | "inactive"
  | "commonGaps"
  | "hypotheses";
export type Span = 3 | 4 | 6 | 8 | 9 | 12;
export interface LayoutItem {
  id: WidgetId;
  span: Span;
  height?: number;
}
export interface DashboardLayout {
  version: 1;
  items: LayoutItem[];
}

export const gridColumns = 12;
export const heightStep = 8;
export const minHeight = 96;
export const maxHeight = 1200;
export const widgetSpans: Record<WidgetId, { allowed: readonly Span[]; initial: Span }> = {
  kpis: { allowed: [6, 8, 9, 12], initial: 12 },
  queue: { allowed: [6, 8, 9, 12], initial: 8 },
  focus: { allowed: [3, 4, 6], initial: 4 },
  activity: { allowed: [6, 8, 12], initial: 8 },
  status: { allowed: [4, 6, 8], initial: 4 },
  roster: { allowed: [6, 8, 9, 12], initial: 12 },
  topicErrors: { allowed: [4, 6, 8], initial: 6 },
  events: { allowed: [4, 6, 8, 12], initial: 6 },
  reviewSpeed: { allowed: [4, 6], initial: 4 },
  closures: { allowed: [4, 6, 8], initial: 6 },
  inactive: { allowed: [3, 4, 6], initial: 4 },
  commonGaps: { allowed: [4, 6, 8], initial: 4 },
  hypotheses: { allowed: [4, 6, 8, 12], initial: 6 },
};
export const widgetOrder = Object.keys(widgetSpans) as WidgetId[];
const defaultIds: WidgetId[] = ["kpis", "queue", "focus", "activity", "status", "roster"];

const isWidgetId = (value: unknown): value is WidgetId =>
  typeof value === "string" && Object.hasOwn(widgetSpans, value);

export function defaultLayout(): DashboardLayout {
  return { version: 1, items: defaultIds.map((id) => ({ id, span: widgetSpans[id].initial })) };
}
export const sameLayout = (a: DashboardLayout, b: DashboardLayout) =>
  a.items.length === b.items.length &&
  a.items.every(
    (item, index) =>
      item.id === b.items[index].id &&
      item.span === b.items[index].span &&
      item.height === b.items[index].height,
  );
export const isDefaultLayout = (layout: DashboardLayout) => sameLayout(layout, defaultLayout());

export function nearestSpan(columns: number, allowed: readonly Span[]): Span {
  return allowed.reduce((best, span) =>
    Math.abs(span - columns) < Math.abs(best - columns) ? span : best,
  );
}
export function snapHeight(pixels: number) {
  return Math.min(maxHeight, Math.max(minHeight, Math.round(pixels / heightStep) * heightStep));
}
export function stepSpan(id: WidgetId, span: Span, direction: -1 | 1): Span {
  const { allowed } = widgetSpans[id];
  const index = allowed.indexOf(nearestSpan(span, allowed));
  return allowed[Math.min(allowed.length - 1, Math.max(0, index + direction))];
}

export function normalizeLayout(raw: unknown): DashboardLayout {
  if (!raw || typeof raw !== "object") return defaultLayout();
  const { version, items } = raw as { version?: unknown; items?: unknown };
  if (version !== 1 || !Array.isArray(items)) return defaultLayout();
  const seen = new Set<WidgetId>();
  const result: LayoutItem[] = [];
  for (const item of items) {
    const { id, span, height } = (item ?? {}) as { id?: unknown; span?: unknown; height?: unknown };
    if (!isWidgetId(id) || seen.has(id)) continue;
    seen.add(id);
    const { allowed, initial } = widgetSpans[id];
    result.push({
      id,
      span:
        typeof span === "number" && Number.isFinite(span) ? nearestSpan(span, allowed) : initial,
      ...(typeof height === "number" && Number.isFinite(height) && { height: snapHeight(height) }),
    });
  }
  if (items.length && !result.length) return defaultLayout();
  return { version: 1, items: result };
}

export function moveWidget(layout: DashboardLayout, id: WidgetId, toIndex: number) {
  const from = layout.items.findIndex((item) => item.id === id);
  const to = Math.min(layout.items.length - 1, Math.max(0, toIndex));
  if (from < 0 || from === to) return layout;
  const items = [...layout.items];
  const [moved] = items.splice(from, 1);
  items.splice(to, 0, moved);
  return { ...layout, items };
}
export function moveBy(layout: DashboardLayout, id: WidgetId, delta: -1 | 1) {
  const index = layout.items.findIndex((item) => item.id === id);
  return index < 0 ? layout : moveWidget(layout, id, index + delta);
}
export function resizeWidget(layout: DashboardLayout, id: WidgetId, columns: number) {
  const span = nearestSpan(columns, widgetSpans[id].allowed);
  const current = layout.items.find((item) => item.id === id);
  if (!current || current.span === span) return layout;
  return {
    ...layout,
    items: layout.items.map((item) => (item.id === id ? { ...item, span } : item)),
  };
}
export function resizeHeight(layout: DashboardLayout, id: WidgetId, pixels: number | undefined) {
  const height = pixels === undefined ? undefined : snapHeight(pixels);
  const current = layout.items.find((item) => item.id === id);
  if (!current || current.height === height) return layout;
  return {
    ...layout,
    items: layout.items.map((item) => {
      if (item.id !== id) return item;
      if (height !== undefined) return { ...item, height };
      const rest = { ...item };
      delete rest.height;
      return rest;
    }),
  };
}
export function addWidget(layout: DashboardLayout, id: WidgetId, index = layout.items.length) {
  if (layout.items.some((item) => item.id === id)) return layout;
  const items = [...layout.items];
  items.splice(Math.max(0, index), 0, { id, span: widgetSpans[id].initial });
  return { ...layout, items };
}
export function removeWidget(layout: DashboardLayout, id: WidgetId) {
  if (!layout.items.some((item) => item.id === id)) return layout;
  return { ...layout, items: layout.items.filter((item) => item.id !== id) };
}
export function availableWidgets(layout: DashboardLayout) {
  const placed = new Set(layout.items.map((item) => item.id));
  return widgetOrder.filter((id) => !placed.has(id));
}

export type Breakpoint = "wide" | "medium" | "narrow";
export type PlacedWidget = { id: WidgetId; span: number; rowStart: boolean; height?: number };
const columnsAt: Record<Breakpoint, number> = { wide: gridColumns, medium: 6, narrow: 1 };
const defaultOrder: Record<Exclude<Breakpoint, "wide">, WidgetId[]> = {
  medium: ["kpis", "queue", "activity", "status", "focus", "roster"],
  narrow: ["queue", "kpis", "activity", "status", "focus", "roster"],
};

export function arrangeWidgets(
  layout: DashboardLayout,
  breakpoint: Breakpoint,
  { editing, visible = () => true }: { editing: boolean; visible?: (id: WidgetId) => boolean },
): PlacedWidget[] {
  const columns = columnsAt[breakpoint];
  const untouched = !editing && breakpoint !== "wide" && isDefaultLayout(layout);
  const items = untouched
    ? defaultOrder[breakpoint].map((id) => layout.items.find((item) => item.id === id)!)
    : layout.items;
  const shown = editing ? items : items.filter((item) => visible(item.id));
  const placed: PlacedWidget[] = [];
  let used = 0;
  const spanOf = (item: LayoutItem) => {
    if (breakpoint === "wide") return item.span;
    if (breakpoint === "narrow" || untouched || item.span >= 6) return columns;
    return columns / 2;
  };
  const closeRow = () => {
    const last = placed.at(-1);
    if (last && breakpoint !== "wide" && used < columns) last.span += columns - used;
    used = 0;
  };
  for (const item of shown) {
    const span = spanOf(item);
    if (used + span > columns) closeRow();
    placed.push({
      id: item.id,
      span,
      rowStart: used === 0,
      ...(breakpoint === "wide" && item.height !== undefined && { height: item.height }),
    });
    used += span;
  }
  closeRow();
  return placed;
}
