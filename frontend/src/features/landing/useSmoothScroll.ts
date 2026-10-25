import { useEffect } from "react";
import { useFinePointer, useMotionAllowed } from "../../shared/ui/motionPreference";

export function useSmoothScroll() {
  const motionAllowed = useMotionAllowed();
  const finePointer = useFinePointer();
  const enabled = motionAllowed && finePointer;

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let stop = () => {};
    import("lenis").then(({ default: Lenis }) => {
      if (!active) return;
      const lenis = new Lenis({ autoRaf: true, duration: 1.1, anchors: { offset: -24 } });
      stop = () => lenis.destroy();
    });
    return () => {
      active = false;
      stop();
    };
  }, [enabled]);
}
