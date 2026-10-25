import { useRef } from "react";
import { InkStroke } from "../../shared/ui/InkStroke";
import { useReveal } from "../../shared/ui/useInView";

export function InkUnderline({ delay = 150 }: { delay?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const drawn = useReveal(ref, 0.6);
  return (
    <svg
      ref={ref}
      className="dp-landing-underline"
      viewBox="0 0 200 14"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <InkStroke d="M3 9c38-6 96-8 194-4" drawn={drawn} tone="ink" delay={delay} />
    </svg>
  );
}
