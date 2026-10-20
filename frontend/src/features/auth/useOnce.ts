import { useEffect, useRef } from "react";

export function useOnce(effect: () => void) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    effect();
  });
}
