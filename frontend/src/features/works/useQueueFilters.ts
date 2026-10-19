import { useSearchParams } from "react-router";
import type { WorkStatus } from "../../domain/models";
import { isDayKey, type ActivityFilter, type QueueView } from "../../domain/analytics";
import { statusMeta } from "../../shared/status";

export type QueueFilters = {
  view: QueueView;
  search: string;
  student: string;
  status?: WorkStatus;
  day?: string;
};

const isStatus = (value: string | null): value is WorkStatus =>
  !!value && Object.hasOwn(statusMeta, value);

export function useQueueFilters() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view");
  const status = params.get("status");
  const day = params.get("day");
  const filters: QueueFilters = {
    view: view === "all" || view === "confirmed" ? view : "attention",
    search: params.get("search") || "",
    student: params.get("student") || "",
    status: isStatus(status) ? status : undefined,
    day: isDayKey(day) ? day : undefined,
  };
  const update = (patch: FilterPatch) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value && !(key === "view" && value === "attention")) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true, preventScrollReset: true });
  };
  return { filters, update };
}

type FilterPatch = Partial<Record<keyof QueueFilters, string | undefined>>;

export function chartFilterPatch(value: ActivityFilter): FilterPatch {
  return {
    day: value.day,
    status: value.status,
    search: undefined,
    ...((value.day || value.status) && { view: "all" }),
  };
}
export function worksLink(patch: FilterPatch) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(patch)) if (value) params.set(key, value);
  const query = params.toString();
  return "/works" + (query ? "?" + query : "");
}

export function revealQueue(queue: HTMLElement | null) {
  if (!queue) return;
  const { top } = queue.getBoundingClientRect();
  if (top < 0 || top > window.innerHeight)
    queue.scrollIntoView({
      block: "start",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
}
