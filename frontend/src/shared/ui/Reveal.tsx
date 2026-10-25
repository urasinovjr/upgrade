import { type CSSProperties, Fragment, type ReactNode, useRef } from "react";
import { useReveal } from "./useInView";

interface RevealProps {
  children: ReactNode;
  index?: number;
  className?: string;
}

function revealStyle(index: number) {
  return { "--reveal-index": index } as CSSProperties;
}

export function Reveal({ children, index = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const revealed = useReveal(ref, 0.2);
  return (
    <div
      ref={ref}
      className={className ? "dp-reveal " + className : "dp-reveal"}
      data-revealed={revealed}
      style={revealStyle(index)}
    >
      {children}
    </div>
  );
}

export function RevealWords({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const revealed = useReveal(ref, 0.5);
  const words = text.split(" ");
  return (
    <span ref={ref} className="dp-reveal-words" data-revealed={revealed}>
      {words.map((word, index) => (
        <Fragment key={index}>
          <span className="dp-reveal-word" style={revealStyle(index)}>
            <span>{word}</span>
          </span>
          {index < words.length - 1 && " "}
        </Fragment>
      ))}
    </span>
  );
}
