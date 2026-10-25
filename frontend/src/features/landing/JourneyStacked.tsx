import { type CSSProperties, type ReactNode, useRef } from "react";
import { useReveal } from "../../shared/ui/useInView";
import { JourneyFrame } from "./JourneyFrame";
import { journeySteps } from "./journeyStage";

function itemStyle(index: number) {
  return { "--reveal-index": index } as CSSProperties;
}

export function JourneyStacked({ head }: { head: ReactNode }) {
  const ref = useRef<HTMLOListElement>(null);
  const revealed = useReveal(ref, 0.15);
  return (
    <>
      <div className="dp-landing-section-head">{head}</div>
      <ol ref={ref} className="dp-journey-cards" data-revealed={revealed}>
        {journeySteps.map((step, index) => (
          <li key={step.title} className="dp-reveal-item" style={itemStyle(index + 1)}>
            <JourneyFrame stage={index} settled={revealed} />
            <span className="dp-journey-index">{index + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
    </>
  );
}
