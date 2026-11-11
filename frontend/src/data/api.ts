import { apiMessage } from "./apiErrors";

export const apiBase = import.meta.env.VITE_API_URL ?? "";
const unsafe = new Set(["POST", "PUT", "PATCH", "DELETE"]);
let csrfToken = "";
let authLost = () => {};
let subscriptionEnded = () => {};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly extra: Record<string, unknown>;
  constructor(code: string, status: number, extra: Record<string, unknown>) {
    super(apiMessage(code, extra));
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

export function setCsrfToken(token: string) {
  csrfToken = token;
}

export function onAuthLost(handler: () => void) {
  authLost = handler;
}

export function onSubscriptionEnded(handler: () => void) {
  subscriptionEnded = handler;
}

type Options = { method?: string; json?: unknown; form?: FormData; keepalive?: boolean };

async function send(path: string, { method = "GET", json, form, keepalive }: Options) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (json !== undefined) headers["Content-Type"] = "application/json";
  if (unsafe.has(method) && csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const body = form ?? (json === undefined ? undefined : JSON.stringify(json));
  let response: Response;
  try {
    response = await fetch(apiBase + path, {
      method,
      headers,
      body,
      credentials: "include",
      keepalive,
    });
  } catch {
    throw new Error("Нет связи с сервером. Проверьте подключение и повторите");
  }
  if (response.ok) return response;
  const data = await response.json().catch(() => null);
  const code = typeof data?.detail === "string" ? data.detail : "request_failed";
  if (response.status === 401 && code === "not_authenticated") authLost();
  if (response.status === 402) subscriptionEnded();
  throw new ApiError(code, response.status, data ?? {});
}

export async function request<T>(path: string, options: Options = {}): Promise<T> {
  const response = await send(path, options);
  if (response.status === 204 || response.status === 202) return undefined as T;
  return (await response.json()) as T;
}

export async function requestBlob(path: string): Promise<Blob> {
  return (await send(path, {})).blob();
}
