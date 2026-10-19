import { describe, expect, it } from "vitest";
import {
  addWidget,
  arrangeWidgets,
  availableWidgets,
  defaultLayout,
  isDefaultLayout,
  moveBy,
  moveWidget,
  nearestSpan,
  normalizeLayout,
  removeWidget,
  resizeHeight,
  resizeWidget,
  snapHeight,
  stepSpan,
  widgetOrder,
  type Breakpoint,
  type DashboardLayout,
} from "./dashboardLayout";

const ids = (layout: DashboardLayout) => layout.items.map((item) => item.id);

describe("dashboard layout", () => {
  it("starts from the current overview: KPIs, queue beside the focus card, charts, roster", () => {
    const layout = defaultLayout();
    expect(layout.items).toEqual([
      { id: "kpis", span: 12 },
      { id: "queue", span: 8 },
      { id: "focus", span: 4 },
      { id: "activity", span: 8 },
      { id: "status", span: 4 },
      { id: "roster", span: 12 },
    ]);
    expect(isDefaultLayout(layout)).toBe(true);
    expect(isDefaultLayout(moveBy(layout, "queue", 1))).toBe(false);
    expect(availableWidgets(layout)).toEqual(widgetOrder.slice(6));
  });
  it("normalizes stored layouts", () => {
    expect(normalizeLayout(undefined)).toEqual(defaultLayout());
    expect(normalizeLayout("layout")).toEqual(defaultLayout());
    expect(normalizeLayout({ version: 2, items: [] })).toEqual(defaultLayout());
    expect(normalizeLayout({ version: 1 })).toEqual(defaultLayout());
    expect(normalizeLayout({ version: 1, items: [] })).toEqual({ version: 1, items: [] });
    expect(normalizeLayout({ version: 1, items: [{ id: "weather", span: 6 }] })).toEqual(
      defaultLayout(),
    );
    expect(
      normalizeLayout({
        version: 1,
        extra: true,
        items: [
          { id: "queue", span: 7 },
          { id: "queue", span: 12 },
          { id: "unknown", span: 4 },
          null,
          { id: "focus" },
          { id: "events", span: 100 },
        ],
      }),
    ).toEqual({
      version: 1,
      items: [
        { id: "queue", span: 6 },
        { id: "focus", span: 4 },
        { id: "events", span: 12 },
      ],
    });
  });
  it("moves widgets without touching the original", () => {
    const layout = defaultLayout();
    const moved = moveWidget(layout, "roster", 0);
    expect(ids(moved)[0]).toBe("roster");
    expect(ids(layout)[0]).toBe("kpis");
    expect(moveWidget(layout, "kpis", -5)).toBe(layout);
    expect(ids(moveWidget(layout, "kpis", 99)).at(-1)).toBe("kpis");
    expect(moveBy(layout, "kpis", -1)).toBe(layout);
    expect(moveBy(layout, "roster", 1)).toBe(layout);
    expect(ids(moveBy(layout, "focus", -1)).slice(0, 3)).toEqual(["kpis", "focus", "queue"]);
    expect(moveBy(layout, "events", 1)).toBe(layout);
  });
  it("snaps widths to what the widget allows", () => {
    expect(nearestSpan(5, [3, 4, 6])).toBe(4);
    expect(nearestSpan(5, [4, 6])).toBe(4);
    expect(nearestSpan(11, [6, 8, 9, 12])).toBe(12);
    const layout = defaultLayout();
    expect(resizeWidget(layout, "queue", 9.4).items[1].span).toBe(9);
    expect(resizeWidget(layout, "focus", 12).items[2].span).toBe(6);
    expect(resizeWidget(layout, "queue", 8)).toBe(layout);
    expect(resizeWidget(layout, "events", 6)).toBe(layout);
    expect(stepSpan("queue", 8, 1)).toBe(9);
    expect(stepSpan("queue", 12, 1)).toBe(12);
    expect(stepSpan("focus", 3, -1)).toBe(3);
  });
  it("adds each widget once and removes it", () => {
    const layout = defaultLayout();
    const added = addWidget(layout, "hypotheses", 1);
    expect(ids(added).slice(0, 3)).toEqual(["kpis", "hypotheses", "queue"]);
    expect(added.items[1].span).toBe(6);
    expect(addWidget(added, "hypotheses")).toBe(added);
    expect(availableWidgets(added)).not.toContain("hypotheses");
    const removed = removeWidget(added, "kpis");
    expect(ids(removed)).not.toContain("kpis");
    expect(availableWidgets(removed)[0]).toBe("kpis");
    expect(removeWidget(removed, "kpis")).toBe(removed);
  });
});

describe("arranging widgets", () => {
  const place = (layout: DashboardLayout, breakpoint: Breakpoint = "wide") =>
    arrangeWidgets(layout, breakpoint, { editing: false }).map(
      ({ id, span, rowStart }) => `${id}:${span}${rowStart ? "|" : ""}`,
    );
  it("keeps exact spans and marks row starts on wide screens", () => {
    expect(place(defaultLayout())).toEqual([
      "kpis:12|",
      "queue:8|",
      "focus:4",
      "activity:8|",
      "status:4",
      "roster:12|",
    ]);
  });
  it("keeps the responsive order of the untouched overview", () => {
    expect(place(defaultLayout(), "medium")).toEqual([
      "kpis:6|",
      "queue:6|",
      "activity:6|",
      "status:6|",
      "focus:6|",
      "roster:6|",
    ]);
    expect(place(defaultLayout(), "narrow").map((entry) => entry.split(":")[0])).toEqual([
      "queue",
      "kpis",
      "activity",
      "status",
      "focus",
      "roster",
    ]);
    expect(
      arrangeWidgets(defaultLayout(), "narrow", { editing: true }).map((entry) => entry.id)[0],
    ).toBe("kpis");
  });
  it("halves narrow widgets on medium screens and fills the holes", () => {
    const layout: DashboardLayout = {
      version: 1,
      items: [
        { id: "focus", span: 4 },
        { id: "inactive", span: 3 },
        { id: "status", span: 4 },
        { id: "roster", span: 12 },
        { id: "reviewSpeed", span: 4 },
      ],
    };
    expect(place(layout, "medium")).toEqual([
      "focus:3|",
      "inactive:3",
      "status:6|",
      "roster:6|",
      "reviewSpeed:6|",
    ]);
    expect(place(layout, "narrow").every((entry) => entry.includes(":1|"))).toBe(true);
  });
  it("hides empty widgets outside edit mode only", () => {
    const visible = (id: string) => id !== "status";
    expect(
      arrangeWidgets(defaultLayout(), "wide", { editing: false, visible }).map(({ id }) => id),
    ).not.toContain("status");
    expect(
      arrangeWidgets(defaultLayout(), "wide", { editing: true, visible }).map(({ id }) => id),
    ).toContain("status");
  });
});

describe("widget heights", () => {
  it("snaps heights, clears them and keeps them through normalization", () => {
    expect(snapHeight(203)).toBe(200);
    expect(snapHeight(10)).toBe(96);
    expect(snapHeight(5000)).toBe(1200);
    const layout = defaultLayout();
    const tall = resizeHeight(layout, "focus", 333);
    expect(tall.items[2]).toEqual({ id: "focus", span: 4, height: 336 });
    expect(isDefaultLayout(tall)).toBe(false);
    expect(resizeHeight(tall, "focus", 336)).toBe(tall);
    expect(resizeHeight(tall, "focus", undefined).items[2]).toEqual({ id: "focus", span: 4 });
    expect(resizeHeight(layout, "focus", undefined)).toBe(layout);
    expect(resizeHeight(layout, "events", 300)).toBe(layout);
    expect(
      normalizeLayout({
        version: 1,
        items: [
          { id: "queue", span: 8, height: 401 },
          { id: "focus", span: 4, height: "tall" },
        ],
      }).items,
    ).toEqual([
      { id: "queue", span: 8, height: 400 },
      { id: "focus", span: 4 },
    ]);
  });
  it("applies heights on wide screens only", () => {
    const layout = resizeHeight(defaultLayout(), "queue", 400);
    expect(arrangeWidgets(layout, "wide", { editing: false })[1]).toMatchObject({ height: 400 });
    expect(arrangeWidgets(layout, "medium", { editing: false })[1].height).toBeUndefined();
    expect(arrangeWidgets(layout, "narrow", { editing: true })[1].height).toBeUndefined();
  });
});
