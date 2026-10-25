import { type ReactNode } from "react";
import { useRichScene } from "../../shared/ui/motionPreference";
import { JourneyScene } from "./JourneyScene";
import { JourneyStacked } from "./JourneyStacked";
import "./journey.css";

export function WorkJourney({ head }: { head: ReactNode }) {
  const richScene = useRichScene();
  if (richScene) return <JourneyScene head={head} />;
  return <JourneyStacked head={head} />;
}
