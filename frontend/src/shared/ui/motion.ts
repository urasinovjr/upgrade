const transitions = new WeakMap<HTMLElement, Animation>();

export function cancelContentChange(element: HTMLElement | null) {
  if (!element) return;
  transitions.get(element)?.cancel();
  transitions.delete(element);
}

export async function changeContent(element: HTMLElement | null, commit: () => void) {
  cancelContentChange(element);
  if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    commit();
    return;
  }
  const animation = element.animate(
    [
      { opacity: 1, transform: "none" },
      { opacity: 0, transform: "translateY(4px)" },
    ],
    { duration: 180, easing: "ease-in" },
  );
  transitions.set(element, animation);
  try {
    await animation.finished;
  } catch {
    return;
  }
  transitions.delete(element);
  if (element.isConnected) commit();
}
