export interface StopwatchState {
  id: string;
  studentId: string;
  taskCount: number;
  taskFamily: string;
  startedAt: number;
  runningSince?: number;
  accumulated: number;
}

export function startStopwatch(
  fields: Pick<StopwatchState, "studentId" | "taskCount" | "taskFamily">,
  id = crypto.randomUUID(),
  now = Date.now(),
): StopwatchState {
  return { ...fields, id, startedAt: now, runningSince: now, accumulated: 0 };
}

export function elapsedMs(state: StopwatchState, now: number): number {
  return state.accumulated + (state.runningSince === undefined ? 0 : now - state.runningSince);
}

export function pause(state: StopwatchState, now: number): StopwatchState {
  return { ...state, accumulated: elapsedMs(state, now), runningSince: undefined };
}

export function resume(state: StopwatchState, now: number): StopwatchState {
  return state.runningSince === undefined ? { ...state, runningSince: now } : state;
}

export function clockText(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return (hours ? hours + ":" + pad(minutes) : String(minutes)) + ":" + pad(seconds);
}
