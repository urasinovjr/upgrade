import { describe, expect, it } from "vitest";
import { createGovernor, renderScale } from "./inkWaterBudget";

function play(governor: ReturnType<typeof createGovernor>, fps: number, ms: number, from = 0) {
  let running = true;
  const step = 1000 / fps;
  for (let now = from; now <= from + ms; now += step) running = governor.tick(now);
  return running;
}

describe("ink water budget", () => {
  it("draws touch screens at half resolution", () => {
    expect(renderScale(3, true)).toBe(0.5);
  });

  it("caps the resolution on a dense screen", () => {
    expect(renderScale(1, false)).toBe(0.5);
    expect(renderScale(2, false)).toBe(0.75);
    expect(renderScale(3, false)).toBe(0.75);
  });

  it("keeps running at a smooth frame rate", () => {
    expect(play(createGovernor(), 60, 10_000)).toBe(true);
  });

  it("forgives one slow window", () => {
    const governor = createGovernor();
    expect(play(governor, 20, 2100)).toBe(true);
    expect(play(governor, 60, 4000, 2100)).toBe(true);
  });

  it("turns off after two slow windows in a row", () => {
    expect(play(createGovernor(), 25, 4500)).toBe(false);
  });

  it("does not count the time on pause as a slow frame", () => {
    const governor = createGovernor();
    play(governor, 60, 1000);
    governor.reset();
    expect(play(governor, 60, 5000, 60_000)).toBe(true);
  });
});
