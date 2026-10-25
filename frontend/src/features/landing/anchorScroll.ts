const minDuration = 0.8;
const maxDuration = 1.8;
const pixelsPerSecond = 4000;

export const anchorOffset = 24;
export const jumpStartEvent = "dp-anchor-jump";
export const jumpEndEvent = "dp-anchor-jump-end";

export interface PinnedRange {
  start: number;
  end: number;
}

export function anchorDuration(distance: number) {
  const duration = 0.6 + Math.abs(distance) / pixelsPerSecond;
  return Math.min(Math.max(duration, minDuration), maxDuration);
}

export function easeInOutCubic(progress: number) {
  if (progress < 0.5) return 4 * progress ** 3;
  return 1 - (-2 * progress + 2) ** 3 / 2;
}

export function isJumping() {
  return document.documentElement.dataset.jumping === "true";
}

export function skipPinned(from: number, to: number, pinned: PinnedRange[]) {
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  const skips = pinned
    .map((range) => ({ start: Math.max(range.start, low), end: Math.min(range.end, high) }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);
  const skipped = skips.reduce((sum, range) => sum + range.end - range.start, 0);
  const distance = high - low - skipped;

  function positionAt(travelled: number) {
    let position = from;
    let left = travelled;
    if (to >= from) {
      for (const range of skips) {
        if (position + left < range.start) return position + left;
        left -= range.start - position;
        position = range.end;
      }
      return Math.min(position + left, to);
    }
    for (const range of [...skips].reverse()) {
      if (position - left > range.end) return position - left;
      left -= position - range.end;
      position = range.start;
    }
    return Math.max(position - left, to);
  }

  return { distance, positionAt };
}
