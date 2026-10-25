import { type PointerEvent, type ReactNode } from "react";
import { useMotionValue, useSpring, useTransform } from "motion/react";
import * as m from "motion/react-m";
import { Link } from "react-router";
import { useFinePointer, useMotionAllowed } from "../../shared/ui/motionPreference";

const MotionLink = m.create(Link);
const spring = { stiffness: 260, damping: 18, mass: 0.5 };

function limit(value: number) {
  return Math.max(-1, Math.min(1, value));
}

interface MagnetLinkProps {
  to: string;
  className: string;
  children: ReactNode;
}

export function MagnetLink({ to, className, children }: MagnetLinkProps) {
  const motionAllowed = useMotionAllowed();
  const finePointer = useFinePointer();
  const enabled = motionAllowed && finePointer;
  const pullX = useMotionValue(0);
  const pullY = useMotionValue(0);
  const x = useSpring(pullX, spring);
  const y = useSpring(pullY, spring);
  const labelX = useTransform(x, (value) => value * 0.5);
  const labelY = useTransform(y, (value) => value * 0.5);

  function move(event: PointerEvent<HTMLAnchorElement>) {
    if (!enabled) return;
    const box = event.currentTarget.getBoundingClientRect();
    pullX.set(limit((event.clientX - box.left - box.width / 2) / (box.width / 2)) * 6);
    pullY.set(limit((event.clientY - box.top - box.height / 2) / (box.height / 2)) * 4);
  }

  function leave() {
    pullX.set(0);
    pullY.set(0);
  }

  return (
    <MotionLink
      to={to}
      className={className + " dp-landing-magnet"}
      onPointerMove={move}
      onPointerLeave={leave}
      style={enabled ? { x, y } : undefined}
    >
      <m.span style={enabled ? { x: labelX, y: labelY } : undefined}>{children}</m.span>
    </MotionLink>
  );
}
