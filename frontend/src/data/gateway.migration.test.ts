import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { openDB } from "idb";
import { defaultLayout } from "../domain/dashboardLayout";
import { seedState } from "./fixtures";

it("upgrades a version 1 database without losing the stored works", async () => {
  const state = seedState();
  state.works = state.works.slice(0, 2);
  const legacy = await openDB("upgrade-demo", 1, {
    upgrade(db) {
      db.createObjectStore("state");
      db.createObjectStore("files");
    },
  });
  await legacy.put("state", state, "root");
  legacy.close();
  const { gateway } = await import("./gateway");
  expect((await gateway.read()).works.map((work) => work.id)).toEqual(
    state.works.map((work) => work.id),
  );
  expect(await gateway.layout()).toEqual(defaultLayout());
});
