import { describe, expect, it } from "vitest";
import { clockText, elapsedMs, pause, resume, type StopwatchState } from "./stopwatch";

const base: StopwatchState = {
  id: "m1",
  studentId: "s1",
  taskCount: 2,
  taskFamily: "equations",
  startedAt: 0,
  runningSince: 0,
  accumulated: 0,
};

describe("stopwatch", () => {
  it("does not count paused time", () => {
    const paused = pause(base, 60_000);
    const resumed = resume(paused, 600_000);

    expect(elapsedMs(paused, 300_000)).toBe(60_000);
    expect(elapsedMs(resumed, 630_000)).toBe(90_000);
    expect(resume(resumed, 700_000)).toBe(resumed);
  });

  it("shows minutes and seconds", () => {
    expect(clockText(65_000)).toBe("1:05");
    expect(clockText(3_725_000)).toBe("1:02:05");
  });
});
