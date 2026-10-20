import { request, setCsrfToken } from "./api";

export type Provider = "yandex" | "vk";

export interface Subscription {
  status: "trial" | "active" | "expired" | "none";
  kind: string | null;
  endsAt: string | null;
  planTitle: string | null;
  contactUrl: string;
  checkoutAvailable: boolean;
}

export interface SessionInfo {
  account: { id: string; email: string | null; displayName: string };
  csrfToken: string;
  subscription: Subscription;
}

export interface AuthConfig {
  termsUrl: string;
  termsVersion: string;
  personalDataUrl: string;
  personalDataVersion: string;
  providers: Provider[];
}

export interface AccountDetails {
  id: string;
  email: string | null;
  displayName: string;
  hasPassword: boolean;
  identities: { provider: Provider; email: string | null; createdAt: string }[];
}

export interface Registration {
  email: string;
  password: string;
  displayName: string;
}

export interface Consents {
  acceptTerms: boolean;
  acceptPersonalData: boolean;
  termsVersion: string;
  personalDataVersion: string;
}

function started(session: SessionInfo) {
  setCsrfToken(session.csrfToken);
  return session;
}

export const providerTitles: Record<Provider, string> = { yandex: "Яндекс ID", vk: "VK ID" };

export const account = {
  config: () => request<AuthConfig>("/auth/config"),
  async session() {
    return started(await request<SessionInfo>("/auth/session"));
  },
  register: (data: Registration & Consents) =>
    request<void>("/auth/register", { method: "POST", json: data }),
  async confirm(token: string) {
    return started(
      await request<SessionInfo>("/auth/confirm", { method: "POST", json: { token } }),
    );
  },
  resendConfirmation: (email: string) =>
    request<void>("/auth/resend-confirmation", { method: "POST", json: { email } }),
  async login(email: string, password: string) {
    return started(
      await request<SessionInfo>("/auth/login", { method: "POST", json: { email, password } }),
    );
  },
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  requestReset: (email: string) =>
    request<void>("/auth/password-reset/request", { method: "POST", json: { email } }),
  resetPassword: (token: string, password: string) =>
    request<void>("/auth/password-reset/confirm", { method: "POST", json: { token, password } }),
  startProvider: (provider: Provider, consents?: Consents) =>
    request<{ authorizeUrl: string }>("/auth/oauth/" + provider + "/start", {
      method: "POST",
      json: consents ?? {},
    }),
  async finishProvider(provider: Provider, code: string, state: string, deviceId?: string) {
    const result = await request<{ result: "session" | "linked"; session: SessionInfo | null }>(
      "/auth/oauth/" + provider + "/callback",
      { method: "POST", json: { code, state, deviceId } },
    );
    if (result.session) started(result.session);
    return result;
  },
  details: () => request<AccountDetails>("/account"),
  linkProvider: (provider: Provider) =>
    request<{ authorizeUrl: string }>("/account/identities/" + provider + "/start", {
      method: "POST",
    }),
  unlinkProvider: (provider: Provider) =>
    request<void>("/account/identities/" + provider, { method: "DELETE" }),
  remove: (password: string | null) =>
    request<void>("/account", { method: "DELETE", json: { password } }),
  subscription: () => request<Subscription>("/subscription"),
};
