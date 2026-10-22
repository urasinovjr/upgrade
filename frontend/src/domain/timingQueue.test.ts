import { describe, expect, it } from "vitest";
import { afterSend, fresh, keepUnknownFor, type QueuedInterval } from "./timingQueue";

function queued(id: string, workId: string, queuedAt = 0): QueuedInterval {
  const interval = {
    id,
    workId,
    stage: "review" as const,
    startedAt: "2026-10-22T10:00:00Z",
    endedAt: "2026-10-22T10:01:00Z",
  };
  return { interval, queuedAt };
}

describe("timing queue", () => {
  it("keeps only intervals of works the server does not know yet", () => {
    const items = [queued("a", "w1"), queued("b", "new"), queued("c", "w2")];

    const left = afterSend(items, items.slice(0, 2), ["new"]);

    expect(left.map((item) => item.interval.id)).toEqual(["b", "c"]);
  });

  it("forgets intervals that waited longer than a day", () => {
    const items = [queued("a", "new", 0), queued("b", "new", keepUnknownFor)];

    expect(fresh(items, keepUnknownFor + 1).map((item) => item.interval.id)).toEqual(["b"]);
  });
});
