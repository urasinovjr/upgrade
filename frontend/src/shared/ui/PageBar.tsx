import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TopbarSlots } from "./topbar";

export function PageBar({ trail, actions }: { trail?: ReactNode; actions?: ReactNode }) {
  const slots = useContext(TopbarSlots);
  return (
    <>
      {trail && slots.trail && createPortal(trail, slots.trail)}
      {actions && slots.actions && createPortal(actions, slots.actions)}
    </>
  );
}
