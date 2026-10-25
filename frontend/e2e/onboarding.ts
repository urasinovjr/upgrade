import { test as base, type Page } from "@playwright/test";
import { completedOnboarding } from "../src/domain/onboarding";

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

export const test = base.extend<{ onboarded: boolean }>({
  onboarded: [true, { option: true }],
  page: async ({ page, onboarded }, use) => {
    if (onboarded) await markOnboarded(page);
    await use(page);
  },
});

export { expect } from "@playwright/test";
