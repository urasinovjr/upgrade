import { describe, expect, it } from "vitest";
import { countAt } from "./useCountUp";

describe("count up", () => {
  it("starts at the old number and ends at the new one", () => {
    expect(countAt(0, 12, 0)).toBe(0);
    expect(countAt(0, 12, 1)).toBe(12);
    expect(countAt(5, 2, 1)).toBe(2);
  });

  it("moves fast first and slows down at the end", () => {
    expect(countAt(0, 100, 0.25)).toBeGreaterThan(50);
    expect(countAt(0, 100, 0.75)).toBeGreaterThan(95);
  });

  it("stays within the range when the progress overshoots", () => {
    expect(countAt(0, 10, 1.4)).toBe(10);
    expect(countAt(0, 10, -0.2)).toBe(0);
  });
});
