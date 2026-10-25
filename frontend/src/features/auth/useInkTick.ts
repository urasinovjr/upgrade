import { useState } from "react";
import { useMotionAllowed } from "../../shared/ui/motionPreference";

const tickDuration = 650;

export function useInkTick() {
  const motionAllowed = useMotionAllowed();
  const [ticked, setTicked] = useState(false);

  function finish() {
    setTicked(true);
    if (!motionAllowed) return Promise.resolve();
    return new Promise<void>((resolve) => setTimeout(resolve, tickDuration));
  }

  return { ticked, finish };
}
