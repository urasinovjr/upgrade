import type { Page, Route } from "@playwright/test";
import type { AccountDetails, AuthConfig, SessionInfo, Subscription } from "../src/data/account";
import { fixtureUploads, seedState } from "../src/data/fixtures";
import type { StoreState } from "../src/domain/models";
import { currentRevision } from "../src/domain/review";

export type Plan = "trial" | "active" | "expired";

export interface Scenario {
  session: "guest" | "offline" | "pending" | Plan;
  providers: AuthConfig["providers"];
  state: "filled" | "empty" | "no-works" | "failed" | "pending";
  pilot?: boolean;
}

export const defaultScenario: Scenario = {
  session: "trial",
  providers: ["yandex", "vk"],
  state: "filled",
};

const day = 86400000;

function manualSessions(now: number) {
  return [
    {
      id: "manual-1",
      studentId: "anna",
      taskCount: 4,
      taskFamily: "equations",
      activeSeconds: 1500,
      correctedSeconds: 1440,
      startedAt: new Date(now - day - 1500_000).toISOString(),
      finishedAt: new Date(now - day).toISOString(),
    },
  ];
}
const unsafe = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function subscription(plan: Plan, now: number): Subscription {
  const titles = { trial: null, active: "Репетитор", expired: "Репетитор" };
  const ends = { trial: now + 14 * day, active: now + 30 * day, expired: now - 3 * day };
  return {
    status: plan,
    kind: plan === "trial" ? "trial" : "paid",
    endsAt: new Date(ends[plan]).toISOString(),
    planTitle: titles[plan],
    contactUrl: "https://example.com/billing",
    checkoutAvailable: false,
  };
}

function session(plan: Plan, now: number): SessionInfo {
  return {
    account: { id: "teacher", email: "olga@example.com", displayName: "Ольга Петрова" },
    csrfToken: "csrf",
    subscription: subscription(plan, now),
  };
}

function authConfig(providers: AuthConfig["providers"]): AuthConfig {
  return {
    termsUrl: "https://example.com/terms",
    termsVersion: "1",
    personalDataUrl: "https://example.com/personal-data",
    personalDataVersion: "1",
    providers,
  };
}

function accountDetails(now: number): AccountDetails {
  return {
    id: "teacher",
    email: "olga@example.com",
    displayName: "Ольга Петрова",
    hasPassword: true,
    identities: [
      { provider: "yandex", email: "olga@yandex.ru", createdAt: new Date(now - day).toISOString() },
    ],
  };
}

function filledState(now: number): StoreState {
  const state = seedState(now);
  return {
    ...state,
    works: state.works.map((work) => ({
      ...work,
      demo: false,
      published: work.published.map((revision) => ({ ...revision, id: "revision-" + work.id })),
      currentPublishedId: work.currentPublishedId && "revision-" + work.id,
    })),
  };
}

const emptyState: StoreState = { students: [], works: [], closures: [] };

function scenarioState(scenario: Scenario, now: number): StoreState {
  if (scenario.state === "empty") return emptyState;
  const state = filledState(now);
  return scenario.state === "no-works" ? { ...state, works: [], closures: [] } : state;
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function failure(route: Route, status: number, detail: string) {
  return json(route, { detail }, status);
}

export async function mockApi(page: Page, scenario: Scenario, now: number) {
  const unhandled: string[] = [];
  const state = scenarioState(scenario, now);
  const sheet = await fixtureUploads(state)[0]?.blob.text();
  const plan = scenario.session as Plan;
  const signedIn = ["trial", "active", "expired"].includes(scenario.session);

  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const method = route.request().method();
      const path = new URL(route.request().url()).pathname.slice("/api".length);
      if (path === "/auth/config") return json(route, authConfig(scenario.providers));
      if (path === "/auth/session") {
        if (scenario.session === "offline") return route.abort("failed");
        if (scenario.session === "pending") return;
        if (!signedIn) return failure(route, 401, "not_authenticated");
        return json(route, session(plan, now));
      }
      if (path === "/auth/login") return failure(route, 401, "invalid_credentials");
      if (path === "/auth/register") return failure(route, 422, "password_too_weak");
      if (path === "/auth/confirm") return failure(route, 400, "token_invalid");
      if (!signedIn) return failure(route, 401, "not_authenticated");
      if (unsafe.has(method) && plan === "expired")
        return failure(route, 402, "subscription_inactive");
      if (method !== "GET") {
        unhandled.push(method + " " + path);
        return failure(route, 501, "not_mocked");
      }
      const report = path.match(/^\/works\/([^/]+)\/report$/);
      if (path === "/state" || report) {
        if (scenario.state === "pending") return;
        if (scenario.state === "failed") return failure(route, 500, "storage_unavailable");
      }
      if (path === "/state") return json(route, state);
      if (path.startsWith("/files/"))
        return route.fulfill({ status: 200, contentType: "image/svg+xml", body: sheet });
      if (report) {
        const work = state.works.find((item) => item.id === report[1]);
        const student = state.students.find((item) => item.id === work?.studentId);
        const revision = work && currentRevision(work);
        if (!work || !student || !revision) return failure(route, 404, "work_not_found");
        return json(route, { work, student, revision });
      }
      if (path === "/account") return json(route, accountDetails(now));
      if (path === "/subscription") return json(route, subscription(plan, now));
      if (path === "/account/preferences/dashboard-layout") return json(route, null);
      if (path === "/timing") return json(route, { enabled: Boolean(scenario.pilot) });
      if (path === "/timing/manual" && scenario.pilot) return json(route, manualSessions(now));
      unhandled.push(method + " " + path);
      return failure(route, 501, "not_mocked");
    },
  );
  return unhandled;
}
