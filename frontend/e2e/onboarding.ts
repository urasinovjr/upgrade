import { test as base, type Page } from "@playwright/test";
import { completedOnboarding } from "../src/domain/onboarding";
import type { StoreState } from "../src/domain/models";

export async function markOnboarded(page: Page) {
  await page.addInitScript((value) => {
    const request = indexedDB.open("upgrade-demo", 2);
    request.onupgradeneeded = () => {
      for (const name of ["state", "files", "preferences"]) {
        if (!request.result.objectStoreNames.contains(name)) {
          request.result.createObjectStore(name);
        }
      }
    };
    request.onsuccess = () => {
      const transaction = request.result.transaction("preferences", "readwrite");
      const store = transaction.objectStore("preferences");
      const stored = store.get("onboarding");
      stored.onsuccess = () => {
        if (stored.result === undefined) store.put(value, "onboarding");
      };
      transaction.oncomplete = () => request.result.close();
    };
  }, completedOnboarding());
}

export async function writeDemo(page: Page, store: string, key: string, value: unknown) {
  await page.evaluate(
    async ([store, key, value]) => {
      const request = indexedDB.open("upgrade-demo");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = db.transaction(store as string, "readwrite");
      transaction.objectStore(store as string).put(value, key as string);
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    },
    [store, key, value],
  );
}

export async function readDemoWork(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const opening = indexedDB.open("upgrade-demo");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      const request = db.transaction("state").objectStore("state").get("root");
      const state = await new Promise<StoreState>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result as StoreState);
        request.onerror = () => reject(request.error);
      });
      const work = state.works.find((work) => work.id === id);
      if (!work) throw new Error("Demo work not found: " + id);
      return work;
    } finally {
      db.close();
    }
  }, id);
}

export const test = base.extend<{ onboarded: boolean }>({
  onboarded: [true, { option: true }],
  page: async ({ page, onboarded }, use) => {
    if (onboarded) await markOnboarded(page);
    await use(page);
  },
});

export { expect } from "@playwright/test";
