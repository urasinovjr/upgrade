import type { Evidence, StoreState } from "../../domain/models";
import { reducedMotion } from "./knowledge";
export const recentLimit = 6;

export function revealTop(element: HTMLElement, amount: number) {
  let scroller: HTMLElement | null = element.parentElement;
  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY))
    scroller = scroller.parentElement;
  const target = scroller ?? document.scrollingElement ?? document.documentElement;
  const bottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
  const box = element.getBoundingClientRect();
  const overflow = box.top + Math.min(box.height, amount) - bottom + 16;
  if (overflow > 0)
    target.scrollBy({ top: overflow, behavior: reducedMotion() ? "auto" : "smooth" });
}

export function evidenceLink(state: StoreState, item: Evidence) {
  const work = state.works.find((entry) => entry.id === item.workId);
  if (work && !work.editing && work.currentPublishedId === item.revisionId)
    return {
      to: "/works/" + item.workId + "?task=" + encodeURIComponent(item.taskId),
      label: "опубликованная версия",
    };
  const number = work?.published.find((revision) => revision.id === item.revisionId)?.number;
  return {
    to: "/works/" + item.workId + "/report?revision=" + item.revisionId,
    label: number ? "отчёт, версия " + number : "отчёт",
  };
}
