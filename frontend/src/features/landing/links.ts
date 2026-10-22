import { serverMode } from "../../data/gateway";

export type LandingLinks = {
  start: string;
  startLabel: string;
  secondary?: string;
  secondaryLabel?: string;
  signIn?: string;
};

export const landingLinks: LandingLinks = serverMode
  ? {
      start: "/register",
      startLabel: "Попробовать 14 дней",
      secondary: "/login",
      secondaryLabel: "Войти",
      signIn: "/login",
    }
  : {
      start: "/dashboard",
      startLabel: "Открыть демо",
    };
