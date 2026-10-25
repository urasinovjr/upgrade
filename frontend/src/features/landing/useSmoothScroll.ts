import { useEffect } from "react";
import { useFinePointer, useMotionAllowed } from "../../shared/ui/motionPreference";
import {
  anchorDuration,
  anchorOffset,
  easeInOutCubic,
  jumpEndEvent,
  jumpStartEvent,
  type PinnedRange,
  skipPinned,
} from "./anchorScroll";

const interruptions = ["wheel", "touchstart", "pointerdown", "keydown"];

function anchorTarget(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  if (!(event.target instanceof Element)) return null;
  const link = event.target.closest<HTMLAnchorElement>('a[href^="#"]');
  if (!link || link.hash.length < 2) return null;
  const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
  return target ? { link, target } : null;
}

function pinnedRanges(): PinnedRange[] {
  return [...document.querySelectorAll<HTMLElement>("[data-pinned]")].map((element) => {
    const start = element.getBoundingClientRect().top + window.scrollY;
    return { start, end: start + element.offsetHeight - window.innerHeight };
  });
}

export function useSmoothScroll() {
  const motionAllowed = useMotionAllowed();
  const finePointer = useFinePointer();
  const enabled = motionAllowed && finePointer;

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let stop = () => {};
    let finishJump = () => {};
    import("lenis").then(({ default: Lenis }) => {
      if (!active) return;
      const lenis = new Lenis({ autoRaf: true, duration: 1.1 });

      const onClick = (event: MouseEvent) => {
        const anchor = anchorTarget(event);
        if (!anchor) return;
        event.preventDefault();
        finishJump();
        const from = window.scrollY;
        const wanted = from + anchor.target.getBoundingClientRect().top - anchorOffset;
        const to = Math.min(Math.max(wanted, 0), lenis.limit);
        const path = skipPinned(from, to, pinnedRanges());
        const root = document.documentElement;

        finishJump = () => {
          finishJump = () => {};
          delete root.dataset.jumping;
          interruptions.forEach((name) => window.removeEventListener(name, finishJump));
          window.dispatchEvent(new Event(jumpEndEvent));
        };
        root.dataset.jumping = "true";
        window.dispatchEvent(new CustomEvent(jumpStartEvent, { detail: { to } }));
        interruptions.forEach((name) => window.addEventListener(name, finishJump));

        lenis.scrollTo(from, { immediate: true, force: true });
        lenis.scrollTo(to, {
          duration: anchorDuration(path.distance),
          easing: (progress) => {
            if (to === from) return 1;
            const travelled = easeInOutCubic(progress) * path.distance;
            return (path.positionAt(travelled) - from) / (to - from);
          },
          onComplete: () => {
            finishJump();
            anchor.target.focus({ preventScroll: true });
          },
        });
        history.pushState(null, "", anchor.link.hash);
      };

      document.addEventListener("click", onClick);
      stop = () => {
        finishJump();
        document.removeEventListener("click", onClick);
        lenis.destroy();
      };
    });
    return () => {
      active = false;
      stop();
    };
  }, [enabled]);
}
