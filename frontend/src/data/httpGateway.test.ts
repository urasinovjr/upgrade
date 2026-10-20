import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, onAuthLost, setCsrfToken } from "./api";
import { httpGateway } from "./httpGateway";
import type { Upload, Work } from "../domain/models";

type Call = { url: string; init: RequestInit };

function stubFetch(...responses: Response[]) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return responses.shift() ?? new Response(null, { status: 204 });
    }),
  );
  return calls;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function work(revision: number): Work {
  return {
    id: "w1",
    studentId: "s1",
    title: "Работа",
    createdAt: "2026-10-21T10:00:00Z",
    demo: false,
    status: "preparation",
    attachments: [],
    draft: { revision, inputRevision: 0, analysedInputRevision: -1, tasks: [], feedback: "" },
    published: [],
    editing: true,
    manual: true,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfToken("");
});

describe("http gateway", () => {
  it("sends the server revision as the base of a draft save", async () => {
    const calls = stubFetch(
      json({ students: [], works: [work(4)], closures: [] }),
      json({ revision: 5, inputRevision: 0 }),
      json({ revision: 6, inputRevision: 0 }),
    );
    await httpGateway.read();
    await httpGateway.draft("w1", { ...work(9).draft, feedback: "a" });
    await httpGateway.draft("w1", { ...work(10).draft, feedback: "b" });
    const bases = calls.slice(1).map((call) => JSON.parse(String(call.init.body)).baseRevision);
    expect(bases).toEqual([4, 5]);
    expect(calls[1].init.method).toBe("PUT");
  });

  it("adds the CSRF token to changing requests only", async () => {
    setCsrfToken("csrf-1");
    const calls = stubFetch(json({ students: [], works: [], closures: [] }), json({}));
    await httpGateway.read();
    await httpGateway.student({ id: "s1", name: "Мария", grade: 10, goal: "", color: "teal" });
    const headers = calls.map((call) => call.init.headers as Record<string, string>);
    expect(headers[0]["X-CSRF-Token"]).toBeUndefined();
    expect(headers[1]["X-CSRF-Token"]).toBe("csrf-1");
    expect(calls.every((call) => call.init.credentials === "include")).toBe(true);
  });

  it("uploads metadata and files in one form", async () => {
    const calls = stubFetch(json(work(1)));
    const upload = {
      id: "f1",
      name: "photo.png",
      type: "image/png",
      size: 3,
      pages: 1,
      pageOrder: [1],
      crops: {},
      blob: new Blob(["png"], { type: "image/png" }),
    } satisfies Upload;
    await httpGateway.create(work(1), [upload]);
    const form = calls[0].init.body as FormData;
    expect(JSON.parse(String(form.get("meta")))).toMatchObject({
      id: "w1",
      studentId: "s1",
      attachments: [{ id: "f1", name: "photo.png" }],
    });
    expect(form.get("f1")).toBeInstanceOf(Blob);
  });

  it("turns server errors into readable messages", async () => {
    stubFetch(json({ detail: "review_blocked", blockers: ["Задача 1: заполните шаги."] }, 409));
    const failure = httpGateway.action("w1", "confirm");
    await expect(failure).rejects.toThrow("Задача 1: заполните шаги.");
    await expect(failure).rejects.toBeInstanceOf(ApiError);
  });

  it("reports a lost session", async () => {
    const lost = vi.fn();
    onAuthLost(lost);
    stubFetch(json({ detail: "not_authenticated" }, 401));
    await expect(httpGateway.read()).rejects.toMatchObject({ status: 401 });
    expect(lost).toHaveBeenCalledOnce();
  });

  it("falls back to the default dashboard layout", async () => {
    stubFetch(json(null));
    const layout = await httpGateway.layout();
    expect(layout.items.length).toBeGreaterThan(0);
  });
});
