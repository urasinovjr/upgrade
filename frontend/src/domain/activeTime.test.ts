import { describe, expect, it } from "vitest";
import {
  chunkLimit,
  idleLimit,
  nextActivity,
  startActivity,
  type ActiveInterval,
  type Activity,
  type ActivityEvent,
} from "./activeTime";

function play(events: ActivityEvent[], start = startActivity(0)) {
  let count = 0;
  let activity: Activity = start;
  const intervals: ActiveInterval[] = [];
  for (const event of events) {
    const [next, finished] = nextActivity(activity, event, () => "i" + ++count);
    activity = next;
    intervals.push(...finished);
  }
  return {
    activity,
    seconds: intervals.map(
      (item) => (Date.parse(item.endedAt) - Date.parse(item.startedAt)) / 1000,
    ),
    intervals,
  };
}

const minute = 60 * 1000;

describe("active time", () => {
  it("counts time between the first input and leaving the stage", () => {
    const { seconds, intervals } = play([
      { kind: "place", at: 0, workId: "w1", stage: "review" },
      { kind: "input", at: minute },
      { kind: "place", at: 3 * minute, workId: "w1", stage: "export" },
      { kind: "input", at: 3 * minute },
      { kind: "place", at: 4 * minute },
    ]);

    expect(seconds).toEqual([180, 60]);
    expect(intervals.map((item) => item.stage)).toEqual(["review", "export"]);
  });

  it("stops two minutes after the last input and restarts on the next one", () => {
    const { seconds } = play([
      { kind: "place", at: 0, workId: "w1", stage: "review" },
      { kind: "input", at: minute },
      { kind: "tick", at: 10 * minute },
      { kind: "input", at: 20 * minute },
      { kind: "visibility", at: 21 * minute, visible: false },
    ]);

    expect(seconds).toEqual([(minute + idleLimit) / 1000, 60]);
  });

  it("does not count a hidden tab", () => {
    const { seconds } = play([
      { kind: "place", at: 0, workId: "w1", stage: "review" },
      { kind: "visibility", at: minute, visible: false },
      { kind: "input", at: 2 * minute },
      { kind: "visibility", at: 3 * minute, visible: true },
      { kind: "input", at: 4 * minute },
      { kind: "place", at: 5 * minute },
    ]);

    expect(seconds).toEqual([60, 120]);
  });

  it("splits long sessions into short intervals", () => {
    const events: ActivityEvent[] = [{ kind: "place", at: 0, workId: "w1", stage: "review" }];
    for (let at = minute; at <= 25 * minute; at += minute) {
      events.push({ kind: "input", at }, { kind: "tick", at });
    }
    events.push({ kind: "place", at: 25 * minute });
    const { seconds } = play(events);

    expect(Math.max(...seconds)).toBeLessThanOrEqual(chunkLimit / 1000);
    expect(seconds.reduce((total, value) => total + value, 0)).toBe(25 * 60);
  });

  it("ignores input outside a work", () => {
    const { seconds, activity } = play([{ kind: "input", at: minute }]);

    expect(seconds).toEqual([]);
    expect(activity.openedAt).toBeUndefined();
  });
});
