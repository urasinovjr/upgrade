import { type RefObject, useEffect, useState } from "react";
import { useMotionAllowed } from "./motionPreference";

interface InViewOptions {
  amount?: number;
  once?: boolean;
}

export function useInView(
  ref: RefObject<Element | null>,
  { amount = 0.35, once = true }: InViewOptions = {},
) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold: amount },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, amount, once]);
  return inView;
}

export function useReveal(ref: RefObject<Element | null>, amount = 0.35) {
  const motionAllowed = useMotionAllowed();
  const inView = useInView(ref, { amount });
  return !motionAllowed || inView;
}
