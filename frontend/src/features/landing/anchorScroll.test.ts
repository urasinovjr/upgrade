import { describe, expect, it } from "vitest";
import { anchorDuration, easeInOutCubic, skipPinned } from "./anchorScroll";

describe("anchor scroll", () => {
  it("takes longer for a longer way but stays within limits", () => {
    expect(anchorDuration(100)).toBe(0.8);
    expect(anchorDuration(2000)).toBeCloseTo(1.1);
    expect(anchorDuration(-2000)).toBeCloseTo(1.1);
    expect(anchorDuration(20_000)).toBe(1.8);
  });

  it("starts and ends slowly and passes the middle on time", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9);
  });

  it("goes straight when nothing is pinned on the way", () => {
    const path = skipPinned(0, 1000, [{ start: 2000, end: 4000 }]);
    expect(path.distance).toBe(1000);
    expect(path.positionAt(0)).toBe(0);
    expect(path.positionAt(400)).toBe(400);
    expect(path.positionAt(1000)).toBe(1000);
  });

  it("jumps over a pinned scene on the way down", () => {
    const path = skipPinned(0, 5000, [{ start: 1000, end: 3700 }]);
    expect(path.distance).toBe(2300);
    expect(path.positionAt(999)).toBe(999);
    expect(path.positionAt(1000)).toBe(3700);
    expect(path.positionAt(1300)).toBe(4000);
    expect(path.positionAt(2300)).toBe(5000);
  });

  it("jumps over a pinned scene on the way up", () => {
    const path = skipPinned(5000, 900, [{ start: 1000, end: 3700 }]);
    expect(path.distance).toBe(1400);
    expect(path.positionAt(1000)).toBe(4000);
    expect(path.positionAt(1300)).toBe(1000);
    expect(path.positionAt(1400)).toBe(900);
  });

  it("leaves a scene at once when the way starts inside it", () => {
    const path = skipPinned(2000, 5000, [{ start: 1000, end: 3700 }]);
    expect(path.distance).toBe(1300);
    expect(path.positionAt(0)).toBe(3700);
    expect(path.positionAt(1300)).toBe(5000);
  });

  it("stops at the target when it is inside a pinned scene", () => {
    const path = skipPinned(0, 2000, [{ start: 1000, end: 3700 }]);
    expect(path.distance).toBe(1000);
    expect(path.positionAt(1000)).toBe(2000);
  });
});
