import { type RefObject, useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";
import { useMotionAllowed } from "../../shared/ui/motionPreference";
import { useInView } from "../../shared/ui/useInView";

const stopEvents = ["pointerdown", "keydown", "focusin"] as const;

function usePageVisible() {
  return useSyncExternalStore(
    (notify) => {
      document.addEventListener("visibilitychange", notify);
      return () => document.removeEventListener("visibilitychange", notify);
    },
    () => document.visibilityState === "visible",
  );
}

export function useAutoplay(
  ref: RefObject<HTMLElement | null>,
  durations: number[],
  onStop: (frame: number) => void,
) {
  const motionAllowed = useMotionAllowed();
  const inView = useInView(ref, { amount: 0.5, once: false });
  const pageVisible = usePageVisible();
  const [frame, setFrame] = useState(0);
  const [stopped, setStopped] = useState(false);
  const playing = motionAllowed && !stopped;

  useEffect(() => {
    if (!playing || !inView || !pageVisible) return;
    const timer = window.setTimeout(
      () => setFrame((current) => (current + 1) % durations.length),
      durations[frame],
    );
    return () => window.clearTimeout(timer);
  }, [playing, inView, pageVisible, frame, durations]);

  const stopAt = useEffectEvent(() => {
    setStopped(true);
    onStop(frame);
  });

  useEffect(() => {
    const element = ref.current;
    if (!element || !playing) return;
    const stop = () => stopAt();
    for (const name of stopEvents) element.addEventListener(name, stop);
    return () => {
      for (const name of stopEvents) element.removeEventListener(name, stop);
    };
  }, [ref, playing]);

  return { frame, playing };
}
