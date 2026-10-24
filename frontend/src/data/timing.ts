import type { ActiveInterval } from "../domain/activeTime";
import type { FamilyId } from "./catalog";
import { request } from "./api";

export interface IntervalsResult {
  accepted: number;
  rejected: number;
  unknownWorkIds: string[];
}

export interface ManualSession {
  id: string;
  studentId: string;
  taskCount: number;
  taskFamily: FamilyId;
  activeSeconds: number;
  correctedSeconds?: number | null;
  startedAt: string;
  finishedAt: string;
}

export const timing = {
  status: () => request<{ enabled: boolean }>("/timing"),
  send: (intervals: ActiveInterval[], keepalive = false) =>
    request<IntervalsResult>("/timing/intervals", {
      method: "POST",
      json: { intervals },
      keepalive,
    }),
  manual: () => request<ManualSession[]>("/timing/manual"),
  saveManual: ({ id, ...data }: ManualSession) =>
    request<ManualSession>("/timing/manual/" + id, { method: "PUT", json: data }),
  removeManual: (id: string) => request<void>("/timing/manual/" + id, { method: "DELETE" }),
};
