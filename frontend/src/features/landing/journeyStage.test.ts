import { describe, expect, it } from "vitest";
import { isSettled, journeySteps, stageAt, stageProgress, stageRange } from "./journeyStage";

describe("journey stages", () => {
  it("has four steps", () => {
    expect(journeySteps).toHaveLength(4);
  });

  it("splits the scroll into equal stages", () => {
    expect(stageAt(0)).toBe(0);
    expect(stageAt(0.1)).toBe(0);
    expect(stageAt(0.35)).toBe(1);
    expect(stageAt(0.6)).toBe(2);
    expect(stageAt(0.85)).toBe(3);
    expect(stageAt(1)).toBe(3);
  });

  it("keeps the stage inside the range when the scroll overshoots", () => {
    expect(stageAt(-0.2)).toBe(0);
    expect(stageAt(1.4)).toBe(3);
  });

  it("gives each stage its own part of the scroll", () => {
    expect(stageRange(0)).toEqual([0, 0.25]);
    expect(stageRange(3)).toEqual([0.75, 1]);
  });

  it("measures the progress inside a stage", () => {
    expect(stageProgress(0.5, 2)).toBe(0);
    expect(stageProgress(0.625, 2)).toBe(0.5);
    expect(stageProgress(0.9, 2)).toBe(1);
    expect(stageProgress(0.1, 2)).toBe(0);
  });

  it("settles a stage after the first part of it", () => {
    expect(isSettled(0.05)).toBe(false);
    expect(isSettled(0.15)).toBe(true);
    expect(isSettled(0.76)).toBe(false);
    expect(isSettled(1)).toBe(true);
  });
});
