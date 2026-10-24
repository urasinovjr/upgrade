import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { Maximize2, Minimize2, Minus, Plus, X } from "lucide-react";

type Mode = "normal" | "collapsed" | "expanded";

export function Panel({
  title,
  summary,
  heading,
  className,
  headerClassName,
  closeBlocked,
  onClose,
  children,
}: {
  title: string;
  summary?: string;
  heading?: ReactNode;
  className?: string;
  headerClassName?: string;
  closeBlocked?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [mode, setMode] = useState<Mode>("normal");
  const root = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const animation = useRef<Animation | null>(null);
  const previousRect = useRef<DOMRect | null>(null);
  const scroll = useRef(0);
  const expandedScroll = useRef(0);
  const beforeExpand = useRef<Mode>("normal");
  const id = useId();
  const changeMode = useCallback(
    (next: Mode) => {
      animation.current?.cancel();
      previousRect.current = root.current?.getBoundingClientRect() ?? null;
      if (mode === "expanded") expandedScroll.current = content.current?.scrollTop ?? 0;
      if (mode !== "collapsed") scroll.current = content.current?.scrollTop ?? 0;
      if (next === "expanded") {
        scroll.current = expandedScroll.current;
        beforeExpand.current = mode;
      }
      setMode(next);
    },
    [mode],
  );
  useLayoutEffect(() => {
    const element = root.current;
    const from = previousRect.current;
    if (content.current) content.current.scrollTop = scroll.current;
    if (!element || !from || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const to = element.getBoundingClientRect();
    animation.current = element.animate(
      [
        {
          transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.width / to.width}, 1)`,
        },
        { transform: "none" },
      ],
      { duration: 300, easing: "cubic-bezier(.22,1,.36,1)" },
    );
    return () => animation.current?.cancel();
  }, [mode]);

  useEffect(() => {
    if (mode !== "expanded" || !root.current) return;
    const element = root.current;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const siblings: { element: HTMLElement; inert: boolean }[] = [];
    let branch: HTMLElement = element;
    while (branch.parentElement && branch !== document.getElementById("root")) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          siblings.push({ element: sibling, inert: sibling.inert });
          sibling.setAttribute("inert", "");
        }
      }
      branch = branch.parentElement;
    }
    const keyboard = (event: KeyboardEvent) => {
      const fromDialog = event
        .composedPath()
        .some((node) => node instanceof Element && node.getAttribute("role") === "dialog");
      const dialogOpen = document.querySelector('[role="dialog"]');
      if (event.defaultPrevented || fromDialog || dialogOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        changeMode(beforeExpand.current);
        expandButton.current?.focus({ preventScroll: true });
      }
      if (event.key === "Tab") {
        const items = [
          ...element.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input, select, textarea, [tabindex="0"]',
          ),
        ].filter((item) => item.getClientRects().length && !item.closest("[inert]"));
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.body.style.overflow = oldOverflow;
      siblings.forEach((sibling) => {
        sibling.element.toggleAttribute("inert", sibling.inert);
      });
      document.removeEventListener("keydown", keyboard);
    };
  }, [mode, changeMode]);

  const close = async () => {
    animation.current?.cancel();
    if (closeBlocked) {
      onClose();
      return;
    }
    if (root.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const exit = root.current.animate(
        [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: "translateY(6px)" },
        ],
        { duration: 200, easing: "ease-in", fill: "forwards" },
      );
      animation.current = exit;
      try {
        await exit.finished;
      } catch {
        return;
      }
    }
    flushSync(onClose);
    const target =
      document.querySelector<HTMLElement>('[role="tab"][data-state="active"]') ??
      document.getElementById("main-content");
    target?.focus({ preventScroll: true });
  };
  const collapseLabel = mode === "collapsed" ? "Раскрыть панель" : "Свернуть панель";
  const expandLabel = mode === "expanded" ? "Обычный размер" : "На весь экран";
  return (
    <section
      ref={root}
      className={"dp-window" + (className ? " " + className : "")}
      data-mode={mode}
      aria-label={title}
    >
      <header className={"dp-window-header" + (headerClassName ? " " + headerClassName : "")}>
        <div className="dp-window-controls" role="group" aria-label="Управление панелью">
          <button
            className="dp-window-close"
            title="Закрыть панель"
            aria-label="Закрыть панель"
            onClick={() => void close()}
          >
            <span>
              <X size={8} />
            </span>
          </button>
          <button
            className="dp-window-collapse"
            title={collapseLabel}
            aria-label={collapseLabel}
            aria-expanded={mode !== "collapsed"}
            aria-controls={id}
            onClick={() => changeMode(mode === "collapsed" ? "normal" : "collapsed")}
          >
            <span>{mode === "collapsed" ? <Plus size={8} /> : <Minus size={8} />}</span>
          </button>
          <button
            ref={expandButton}
            className="dp-window-expand"
            title={expandLabel}
            aria-label={expandLabel}
            aria-pressed={mode === "expanded"}
            onClick={() => changeMode(mode === "expanded" ? beforeExpand.current : "expanded")}
          >
            <span>{mode === "expanded" ? <Minimize2 size={7} /> : <Maximize2 size={7} />}</span>
          </button>
        </div>
        <div className="dp-window-title">
          {heading ?? (
            <>
              <strong>{title}</strong>
              {summary && <span>{summary}</span>}
            </>
          )}
        </div>
        {mode === "expanded" && <span className="dp-window-hint">Esc — обычный размер</span>}
      </header>
      <div
        className="dp-window-reveal"
        inert={mode === "collapsed"}
        aria-hidden={mode === "collapsed"}
      >
        <div ref={content} id={id} className="dp-window-content">
          {children}
        </div>
      </div>
    </section>
  );
}
