import type { ActiveInterval } from "./activeTime";

export const keepUnknownFor = 24 * 60 * 60 * 1000;
export const batchSize = 200;

export interface QueuedInterval {
  interval: ActiveInterval;
  queuedAt: number;
}

export function fresh(items: QueuedInterval[], now: number): QueuedInterval[] {
  return items.filter((item) => now - item.queuedAt < keepUnknownFor);
}

export function afterSend(
  items: QueuedInterval[],
  sent: QueuedInterval[],
  unknownWorkIds: string[],
): QueuedInterval[] {
  const sentIds = new Set(sent.map((item) => item.interval.id));
  const unknown = new Set(unknownWorkIds);
  return [
    ...sent.filter((item) => unknown.has(item.interval.workId ?? item.interval.homeworkId ?? "")),
    ...items.filter((item) => !sentIds.has(item.interval.id)),
  ];
}
