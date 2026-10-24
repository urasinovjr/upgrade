import type { Page } from "@playwright/test";
import { expect } from "./fixtures";
import { phone, primaryWidths, secondaryWidths, type Screen } from "./screens";

const guest = { session: "guest" } as const;
const expired = { session: "expired" } as const;
const empty = { state: "empty" } as const;
const failed = { state: "failed" } as const;
const pending = { state: "pending" } as const;
const loading = { loading: true, headings: 0 };

function showsError(page: Page) {
  return expect(page.getByRole("alert").first()).toBeVisible();
}

export const serverScreens: Screen[] = [
  { name: "guest-home", path: "/", widths: primaryWidths, scenario: guest },
  { name: "login", path: "/login", widths: primaryWidths, scenario: guest },
  {
    name: "login-without-providers",
    path: "/login",
    widths: [1440],
    scenario: { ...guest, providers: [] },
  },
  {
    name: "login-error",
    path: "/login",
    widths: [phone],
    scenario: guest,
    prepare: async (page) => {
      await page.getByLabel("Почта").fill("olga@example.com");
      await page.getByLabel("Пароль").fill("wrong password");
      await page.getByRole("button", { name: "Войти", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("Неверная почта или пароль");
    },
  },
  { name: "register", path: "/register", widths: primaryWidths, scenario: guest },
  {
    name: "register-error",
    path: "/register",
    widths: secondaryWidths,
    scenario: guest,
    prepare: async (page) => {
      await page.getByLabel("Как к вам обращаться").fill("Ольга Петрова");
      await page.getByLabel("Почта").fill("olga@example.com");
      await page.getByLabel("Пароль").fill("1234567890");
      for (const consent of await page.getByRole("checkbox").all()) await consent.check();
      await page.getByRole("button", { name: "Создать аккаунт" }).click();
      await showsError(page);
    },
  },
  {
    name: "confirm-invalid",
    path: "/auth/confirm?token=expired",
    widths: [1440],
    scenario: guest,
    prepare: (page) => expect(page.getByRole("alert")).toBeVisible(),
  },
  { name: "reset-request", path: "/auth/reset", widths: secondaryWidths, scenario: guest },
  {
    name: "reset-password",
    path: "/auth/reset/confirm?token=token",
    widths: secondaryWidths,
    scenario: guest,
  },
  {
    name: "provider-cancelled",
    path: "/auth/callback/yandex?error=access_denied",
    widths: [1440],
    scenario: guest,
    prepare: (page) => expect(page.getByRole("alert")).toBeVisible(),
  },
  {
    name: "session-pending",
    path: "/dashboard",
    widths: [1440],
    scenario: { session: "pending" },
    capture: { loading: true },
  },
  {
    name: "session-offline",
    path: "/dashboard",
    widths: [phone, 1440],
    scenario: { session: "offline" },
    prepare: (page) =>
      expect(page.getByRole("button", { name: "Попробовать ещё раз" })).toBeVisible(),
  },
  {
    name: "settings",
    path: "/settings",
    widths: primaryWidths,
    prepare: (page) => expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible(),
  },
  {
    name: "settings-pilot",
    path: "/settings",
    widths: [1440],
    scenario: { pilot: true },
    prepare: (page) =>
      expect(page.getByRole("heading", { name: "Замер времени для пилота" })).toBeVisible(),
  },
  {
    name: "manual-stopwatch",
    path: "/timing",
    widths: primaryWidths,
    scenario: { pilot: true },
    prepare: (page) => expect(page.getByText(/задач: 4 · Уравнения · 24 мин/)).toBeVisible(),
  },
  { name: "subscription-trial", path: "/subscription", widths: primaryWidths },
  {
    name: "subscription-active",
    path: "/subscription",
    widths: [1440],
    scenario: { session: "active" },
  },
  { name: "subscription-expired", path: "/subscription", widths: [phone, 1440], scenario: expired },
  { name: "read-only-dashboard", path: "/dashboard", widths: [phone, 1440], scenario: expired },
  {
    name: "read-only-review",
    path: "/works/demo-ready",
    widths: [1440],
    scenario: expired,
    capture: { fullPage: false },
  },
  {
    name: "read-only-report",
    path: "/works/demo-confirmed/report",
    widths: [1440],
    scenario: expired,
  },
  { name: "read-only-works", path: "/works", widths: [phone, 1440], scenario: expired },
  { name: "read-only-student", path: "/students/anna", widths: [1440], scenario: expired },
  { name: "empty-dashboard", path: "/dashboard", widths: [phone, 1440], scenario: empty },
  { name: "empty-works", path: "/works", widths: [1440], scenario: empty },
  { name: "empty-students", path: "/students", widths: [1440], scenario: empty },
  {
    name: "state-failed",
    path: "/works",
    widths: [1440],
    scenario: failed,
    prepare: showsError,
  },
  {
    name: "failed-dashboard",
    path: "/dashboard",
    widths: secondaryWidths,
    scenario: failed,
    prepare: showsError,
  },
  {
    name: "failed-students",
    path: "/students",
    widths: [1440],
    scenario: failed,
    prepare: showsError,
  },
  {
    name: "failed-student",
    path: "/students/anna",
    widths: secondaryWidths,
    scenario: failed,
    prepare: showsError,
  },
  {
    name: "failed-review",
    path: "/works/demo-ready",
    widths: secondaryWidths,
    scenario: failed,
    prepare: showsError,
  },
  {
    name: "failed-report",
    path: "/works/demo-confirmed/report",
    widths: secondaryWidths,
    scenario: failed,
    prepare: showsError,
  },
  {
    name: "no-works-student",
    path: "/students/anna",
    widths: secondaryWidths,
    scenario: { state: "no-works" },
  },
  { name: "no-works-works", path: "/works", widths: [1440], scenario: { state: "no-works" } },
  {
    name: "loading-dashboard",
    path: "/dashboard",
    widths: [1440],
    scenario: pending,
    capture: loading,
  },
  { name: "loading-works", path: "/works", widths: [1440], scenario: pending, capture: loading },
  {
    name: "loading-students",
    path: "/students",
    widths: [1440],
    scenario: pending,
    capture: loading,
  },
  {
    name: "loading-student",
    path: "/students/anna",
    widths: [1440],
    scenario: pending,
    capture: loading,
  },
  {
    name: "loading-review",
    path: "/works/demo-ready",
    widths: [1440],
    scenario: pending,
    capture: loading,
  },
  {
    name: "loading-report",
    path: "/works/demo-confirmed/report",
    widths: secondaryWidths,
    scenario: pending,
    capture: loading,
  },
];
