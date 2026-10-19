import { createContext } from "react";

export const TopbarSlots = createContext<{ trail: Element | null; actions: Element | null }>({
  trail: null,
  actions: null,
});
