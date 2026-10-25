const windowMs = 2000;
const minFps = 40;
const slowWindowLimit = 2;

export function renderScale(devicePixelRatio: number, coarsePointer: boolean) {
  if (coarsePointer) return 0.5;
  return Math.min(devicePixelRatio, 1.5) * 0.5;
}

export function createGovernor() {
  let windowStart = -1;
  let frames = 0;
  let slowWindows = 0;

  function tick(now: number) {
    if (slowWindows >= slowWindowLimit) return false;
    if (windowStart < 0) {
      windowStart = now;
      frames = 0;
      return true;
    }
    frames += 1;
    const elapsed = now - windowStart;
    if (elapsed < windowMs) return true;
    const fps = (frames * 1000) / elapsed;
    slowWindows = fps < minFps ? slowWindows + 1 : 0;
    windowStart = now;
    frames = 0;
    return slowWindows < slowWindowLimit;
  }

  function reset() {
    windowStart = -1;
    frames = 0;
  }

  return { tick, reset };
}
