import { useCallback, useEffect, useRef } from "react";

export function usePinnedActions() {
  const height = useRef(0);
  const panel = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const measure = () => {
      height.current = ["fixed", "sticky"].includes(getComputedStyle(node).position)
        ? Math.ceil(node.getBoundingClientRect().height)
        : 0;
      document.documentElement.style.setProperty("--review-actions-height", height.current + "px");
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      document.documentElement.style.removeProperty("--review-actions-height");
    };
  }, []);
  useEffect(() => {
    let frame = 0;
    const keepFocusVisible = (event: FocusEvent) => {
      const target = event.target;
      if (
        !(target instanceof HTMLElement) ||
        !target.matches("input, textarea, select, math-field")
      )
        return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const styles = getComputedStyle(document.documentElement);
        const navHeight =
          innerWidth <= 700
            ? document.querySelector(".sidebar")?.getBoundingClientRect().height || 66
            : 0;
        const reserved =
          height.current +
          parseFloat(styles.getPropertyValue("--keyboard-height") || "0") +
          navHeight +
          32;
        const top =
          (document.querySelector(".dp-topbar")?.getBoundingClientRect().bottom ?? 0) + 24;
        const rect = target.getBoundingClientRect();
        const viewportHeight = window.visualViewport?.height || innerHeight;
        const hidden = rect.bottom > viewportHeight - reserved || rect.top < top;
        if (hidden) target.scrollIntoView({ block: "center" });
      });
    };
    document.addEventListener("focusin", keepFocusVisible);
    return () => {
      document.removeEventListener("focusin", keepFocusVisible);
      cancelAnimationFrame(frame);
    };
  }, []);
  return panel;
}
