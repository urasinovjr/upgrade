import { useScroll, useSpring } from "motion/react";
import * as m from "motion/react-m";
import { useMotionAllowed } from "../../shared/ui/motionPreference";

export function ScrollProgress() {
  const motionAllowed = useMotionAllowed();
  const { scrollYProgress } = useScroll();
  const smooth = useSpring(scrollYProgress, { stiffness: 200, damping: 40, restDelta: 0.001 });
  return (
    <m.div
      className="dp-landing-progress"
      style={{ scaleX: motionAllowed ? smooth : scrollYProgress }}
      aria-hidden="true"
    />
  );
}
