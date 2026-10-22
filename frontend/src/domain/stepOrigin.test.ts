import { describe, expect, it } from "vitest";
import type { Step } from "./models";
import { changedShare, editDistance, fromOriginal } from "./stepOrigin";

function step(latex: string, recognizedLatex?: string): Step {
  const origin = recognizedLatex
    ? {
        fileId: "f1",
        page: 1,
        region: { x: 0, y: 0, width: 1, height: 0.1 },
        recognizedLatex,
      }
    : undefined;
  return { id: "s1", latex, verdict: "correct", explanation: "", origin };
}

describe("step origin", () => {
  it("counts edits between two formulas", () => {
    expect(editDistance("x=1", "x=1")).toBe(0);
    expect(editDistance("x=1", "x=2")).toBe(1);
    expect(editDistance("", "abc")).toBe(3);
  });

  it("keeps a lightly corrected step linked to the original", () => {
    expect(fromOriginal(step("x = 2", "x=1"))).toBe(true);
    expect(changedShare(step("x = 1", "x=1"))).toBe(0);
  });

  it("marks added and rewritten steps as not taken from the original", () => {
    expect(fromOriginal(step("x=1"))).toBe(false);
    expect(fromOriginal(step("\\frac{a}{b}=c", "x=1"))).toBe(false);
  });
});
