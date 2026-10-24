import type { CropRect, Step } from "./models";

export const editedShare = 0.5;

export interface OriginFocus {
  fileId: string;
  page: number;
  region: CropRect;
  nonce: number;
  label?: string;
}

function compact(latex: string): string {
  return latex.replace(/\s+/g, "");
}

export function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      current.push(
        Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + cost),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

export function changedShare(step: Step): number {
  if (!step.origin) return 1;
  const before = compact(step.origin.recognizedLatex);
  const after = compact(step.latex);
  const longest = Math.max(before.length, after.length);
  return longest ? editDistance(before, after) / longest : 0;
}

export function fromOriginal(step: Step): boolean {
  return Boolean(step.origin) && changedShare(step) <= editedShare;
}
