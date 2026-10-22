export type TimingStage = "preparation" | "masking" | "review" | "export";

export const idleLimit = 2 * 60 * 1000;
export const chunkLimit = 10 * 60 * 1000;

export interface ActiveInterval {
  id: string;
  workId: string;
  stage: TimingStage;
  startedAt: string;
  endedAt: string;
}

export interface Activity {
  workId?: string;
  stage?: TimingStage;
  visible: boolean;
  lastInput: number;
  openedAt?: number;
}

export type ActivityEvent =
  | { kind: "input"; at: number }
  | { kind: "tick"; at: number }
  | { kind: "visibility"; at: number; visible: boolean }
  | { kind: "place"; at: number; workId?: string; stage?: TimingStage };

export function startActivity(now: number): Activity {
  return { visible: true, lastInput: now };
}

function closed(activity: Activity, end: number, newId: () => string): ActiveInterval[] {
  const { openedAt, workId, stage } = activity;
  if (openedAt === undefined || !workId || !stage || end <= openedAt) return [];
  return [
    {
      id: newId(),
      workId,
      stage,
      startedAt: new Date(openedAt).toISOString(),
      endedAt: new Date(end).toISOString(),
    },
  ];
}

function activeEnd(activity: Activity, at: number): number {
  return Math.min(at, activity.lastInput + idleLimit);
}

function canOpen(activity: Activity, at: number): boolean {
  return (
    Boolean(activity.workId && activity.stage && activity.visible) &&
    at - activity.lastInput <= idleLimit
  );
}

export function nextActivity(
  activity: Activity,
  event: ActivityEvent,
  newId: () => string,
): [Activity, ActiveInterval[]] {
  const at = event.at;
  if (event.kind === "input") {
    const idle = at - activity.lastInput > idleLimit;
    const finished = idle ? closed(activity, activity.lastInput + idleLimit, newId) : [];
    const current = idle ? { ...activity, openedAt: undefined } : activity;
    const next = { ...current, lastInput: at };
    return [{ ...next, openedAt: next.openedAt ?? (canOpen(next, at) ? at : undefined) }, finished];
  }
  if (event.kind === "tick") {
    if (activity.openedAt === undefined) return [activity, []];
    if (at - activity.lastInput > idleLimit)
      return [
        { ...activity, openedAt: undefined },
        closed(activity, activeEnd(activity, at), newId),
      ];
    if (at - activity.openedAt >= chunkLimit)
      return [{ ...activity, openedAt: at }, closed(activity, at, newId)];
    return [activity, []];
  }
  const finished = closed(activity, activeEnd(activity, at), newId);
  const next: Activity =
    event.kind === "visibility"
      ? { ...activity, visible: event.visible, openedAt: undefined }
      : { ...activity, workId: event.workId, stage: event.stage, openedAt: undefined };
  return [{ ...next, openedAt: canOpen(next, at) ? at : undefined }, finished];
}
