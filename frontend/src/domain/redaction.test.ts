import { describe, expect, it } from "vitest";
import type { Attachment } from "./models";
import {
  keptChecks,
  layoutChanged,
  sentPageCount,
  uncheckedPages,
  withCheck,
  withMasks,
} from "./redaction";

const mask = { x: 0.1, y: 0.05, width: 0.3, height: 0.1 };

function file(changes: Partial<Attachment> = {}): Attachment {
  return {
    id: "f1",
    name: "scan.pdf",
    type: "application/pdf",
    size: 100,
    pages: 3,
    pageOrder: [1, 2, 3],
    crops: {},
    masks: {},
    checkedPages: [],
    ...changes,
  };
}

describe("redaction", () => {
  it("drops the check of a page whose masks change", () => {
    const checked = file({ checkedPages: [1, 2] });

    const masked = withMasks(checked, 2, [mask]);
    const cleared = withMasks(masked, 2, []);

    expect(masked.masks).toEqual({ "2": [mask] });
    expect(masked.checkedPages).toEqual([1]);
    expect(cleared.masks).toEqual({});
  });

  it("keeps checks only for pages with the same crop and masks", () => {
    const before = file({ masks: { "2": [mask] } });
    const cropped = { ...before, crops: { "1": { x: 0, y: 0.2, width: 1, height: 0.8 } } };

    expect(keptChecks(before, { ...before, checkedPages: [2, 1, 1, 7] })).toEqual([1, 2]);
    expect(keptChecks(before, { ...cropped, checkedPages: [1, 2] })).toEqual([2]);
  });

  it("toggles the check of one page", () => {
    const checked = withCheck(withCheck(file(), 3, true), 1, true);

    expect(checked.checkedPages).toEqual([1, 3]);
    expect(withCheck(checked, 3, false).checkedPages).toEqual([1]);
  });

  it("lists only pages that are sent for analysis", () => {
    const files = [file({ pageOrder: [3, 1], checkedPages: [1] }), file({ id: "f2" })];

    expect(uncheckedPages(files)).toEqual([
      { fileId: "f1", page: 3 },
      { fileId: "f2", page: 1 },
      { fileId: "f2", page: 2 },
      { fileId: "f2", page: 3 },
    ]);
    expect(sentPageCount(files)).toBe(5);
  });

  it("treats a check-only update as an unchanged layout", () => {
    const before = [file()];

    expect(layoutChanged(before, [withCheck(before[0], 1, true)])).toBe(false);
    expect(layoutChanged(before, [withMasks(before[0], 1, [mask])])).toBe(true);
    expect(layoutChanged(before, [file({ pageOrder: [2, 1, 3] })])).toBe(true);
  });
});
