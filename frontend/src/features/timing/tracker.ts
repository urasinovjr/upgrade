import {
  nextActivity,
  startActivity,
  type ActivityEvent,
  type TimingStage,
} from "../../domain/activeTime";
import { afterSend, batchSize, fresh, type QueuedInterval } from "../../domain/timingQueue";
import { timing } from "../../data/timing";

interface Place {
  key: number;
  workId?: string;
  homeworkId?: string;
  stage: TimingStage;
}

const storageKey = "upgrade-timing-queue";
let activity = startActivity(Date.now());
let enabled = false;
let places: Place[] = [];
let lastKey = 0;
let sending = false;

function loadQueue(): QueuedInterval[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? "[]") as QueuedInterval[];
  } catch {
    return [];
  }
}

function saveQueue(items: QueuedInterval[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(items));
  } catch {
    return;
  }
}

function apply(event: ActivityEvent) {
  const [next, finished] = nextActivity(activity, event, () => crypto.randomUUID());
  activity = next;
  if (!enabled || !finished.length) return;
  const now = Date.now();
  saveQueue([...loadQueue(), ...finished.map((interval) => ({ interval, queuedAt: now }))]);
}

function currentPlace() {
  const stage = places.at(-1)?.stage;
  const target = [...places].reverse().find((place) => place.workId || place.homeworkId);
  return { stage, workId: target?.workId, homeworkId: target?.homeworkId };
}

function placeChanged() {
  apply({ kind: "place", at: Date.now(), ...currentPlace() });
}

export function enterPlace(stage: TimingStage, workId?: string, homeworkId?: string) {
  lastKey += 1;
  const key = lastKey;
  places = [...places, { key, stage, workId, homeworkId }];
  placeChanged();
  return () => {
    places = places.filter((place) => place.key !== key);
    placeChanged();
  };
}

export function recordInput() {
  apply({ kind: "input", at: Date.now() });
}

export function recordVisibility(visible: boolean) {
  apply({ kind: "visibility", at: Date.now(), visible });
}

export function tick() {
  apply({ kind: "tick", at: Date.now() });
}

export function setTracking(value: boolean) {
  if (enabled && !value) tick();
  enabled = value;
}

export async function flush(keepalive = false) {
  if (sending) return;
  const items = fresh(loadQueue(), Date.now());
  const batch = items.slice(0, batchSize);
  if (!batch.length) return saveQueue(items);
  sending = true;
  try {
    const result = await timing.send(
      batch.map((item) => item.interval),
      keepalive,
    );
    saveQueue(afterSend(fresh(loadQueue(), Date.now()), batch, result.unknownWorkIds));
  } catch {
    return;
  } finally {
    sending = false;
  }
}
