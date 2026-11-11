import type { Attachment, CropRect } from "./models";

export const maxMasksPerPage = 20;
export const redactionMessage =
  "Перед разбором отметьте на каждой странице оригинала, что личные данные скрыты";

export interface PageRef {
  fileId: string;
  page: number;
}

export function pageMasks(file: Attachment, page: number): CropRect[] {
  return file.masks[String(page)] ?? [];
}

function pageView(file: Attachment, page: number): string {
  return JSON.stringify([file.crops[String(page)] ?? null, pageMasks(file, page)]);
}

export function keptChecks(before: Attachment, after: Attachment): number[] {
  return [...new Set(after.checkedPages)]
    .filter(
      (page) =>
        page >= 1 && page <= after.pages && pageView(before, page) === pageView(after, page),
    )
    .sort((left, right) => left - right);
}

export function withMasks(file: Attachment, page: number, masks: CropRect[]): Attachment {
  const key = String(page);
  const others = Object.fromEntries(Object.entries(file.masks).filter(([item]) => item !== key));
  const next = { ...file, masks: masks.length ? { ...others, [key]: masks } : others };
  return { ...next, checkedPages: keptChecks(file, next) };
}

export function withCheck(file: Attachment, page: number, checked: boolean): Attachment {
  const others = file.checkedPages.filter((item) => item !== page);
  return { ...file, checkedPages: checked ? [...others, page].sort((a, b) => a - b) : others };
}

export function uncheckedPages(files: Attachment[]): PageRef[] {
  return files.flatMap((file) =>
    file.pageOrder
      .filter((page) => !file.checkedPages.includes(page))
      .map((page) => ({ fileId: file.id, page })),
  );
}

export function sentPageCount(files: Attachment[]): number {
  return files.reduce((total, file) => total + file.pageOrder.length, 0);
}

function layoutView(file: Attachment): string {
  return JSON.stringify([file.id, file.pageOrder, file.crops, file.masks]);
}

export function layoutChanged(before: Attachment[], after: Attachment[]): boolean {
  return before.map(layoutView).join("|") !== after.map(layoutView).join("|");
}
