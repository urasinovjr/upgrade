import { useMediaQuery } from "../useMediaQuery";

export function useMotionAllowed() {
  return useMediaQuery("(prefers-reduced-motion: no-preference)");
}

export function useFinePointer() {
  return useMediaQuery("(hover: hover) and (pointer: fine)");
}

export function useRichScene() {
  const motionAllowed = useMotionAllowed();
  const finePointer = useFinePointer();
  const wide = useMediaQuery("(min-width: 900px)");
  return motionAllowed && finePointer && wide;
}
