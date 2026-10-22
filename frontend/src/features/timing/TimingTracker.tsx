import { useEffect } from "react";
import { flush, recordInput, recordVisibility, setTracking, tick } from "./tracker";
import { useTiming } from "./useTiming";

const inputEvents = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

export function TimingTracker() {
  const enabled = useTiming();
  useEffect(() => {
    if (!enabled) return;
    setTracking(true);
    const visibility = () => recordVisibility(document.visibilityState === "visible");
    const leave = () => {
      recordVisibility(false);
      void flush(true);
    };
    for (const name of inputEvents) window.addEventListener(name, recordInput, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", leave);
    const ticking = window.setInterval(tick, 15_000);
    const sending = window.setInterval(() => void flush(), 30_000);
    void flush();
    return () => {
      for (const name of inputEvents) window.removeEventListener(name, recordInput);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", leave);
      window.clearInterval(ticking);
      window.clearInterval(sending);
      setTracking(false);
      void flush();
    };
  }, [enabled]);
  return null;
}
