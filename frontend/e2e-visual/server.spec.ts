import { expect, serverUrl, test } from "./fixtures";
import { checkScreens, phone, type Screen } from "./screens";

test.use({ baseURL: serverUrl });

const guest = { session: "guest" } as const;
const expired = { session: "expired" } as const;
const empty = { state: "empty" } as const;

const screens: Screen[] = [
  { name: "login", path: "/login", widths: [phone, 1440], scenario: guest },
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
  { name: "register", path: "/register", widths: [phone, 1440], scenario: guest },
  {
    name: "confirm-invalid",
    path: "/auth/confirm?token=expired",
    widths: [1440],
    scenario: guest,
    prepare: (page) => expect(page.getByRole("alert")).toBeVisible(),
  },
  { name: "reset-request", path: "/auth/reset", widths: [1440], scenario: guest },
  {
    name: "reset-password",
    path: "/auth/reset/confirm?token=token",
    widths: [phone],
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
    prepare: (page) => expect(page.getByRole("button", { name: "Повторить" })).toBeVisible(),
  },
  {
    name: "settings",
    path: "/settings",
    widths: [phone, 1440],
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
    widths: [phone, 1440],
    scenario: { pilot: true },
    prepare: (page) => expect(page.getByText(/задач: 4 · Уравнения · 24 мин/)).toBeVisible(),
  },
  { name: "subscription-trial", path: "/subscription", widths: [1440] },
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
    scenario: { state: "failed" },
    prepare: (page) => expect(page.getByRole("alert").first()).toBeVisible(),
  },
  {
    name: "loading-dashboard",
    path: "/dashboard",
    widths: [1440],
    scenario: { state: "pending" },
    capture: { loading: true, headings: 0 },
  },
  {
    name: "loading-works",
    path: "/works",
    widths: [1440],
    scenario: { state: "pending" },
    capture: { loading: true, headings: 0 },
  },
];

checkScreens(screens);
