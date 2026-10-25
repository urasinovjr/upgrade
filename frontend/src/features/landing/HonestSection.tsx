import { type ReactNode, useRef } from "react";
import { usePointerLight } from "../../shared/ui/usePointerLight";

export function HonestSection({ children }: { children: ReactNode }) {
  const sectionRef = useRef<HTMLElement>(null);
  const lightRef = useRef<HTMLDivElement>(null);
  usePointerLight(sectionRef, lightRef);
  return (
    <section
      ref={sectionRef}
      className="dp-landing-section dp-landing-honest"
      id="honest"
      tabIndex={-1}
      aria-labelledby="honest-title"
    >
      <div ref={lightRef} className="dp-landing-honest-light" aria-hidden="true" />
      {children}
    </section>
  );
}
