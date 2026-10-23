import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { apiMessage } from "./apiErrors";

const errorsFile = path.resolve(import.meta.dirname, "../../../backend/app/errors.py");
const backendCodes = [...readFileSync(errorsFile, "utf8").matchAll(/"([a-z_]+)": status\./g)].map(
  (match) => match[1],
);

describe("api error messages", () => {
  it("reads the error codes from the backend", () => {
    expect(backendCodes.length).toBeGreaterThan(40);
  });

  it.each(backendCodes)("explains %s in its own words", (code) => {
    expect(apiMessage(code)).not.toBe(apiMessage("unknown_code"));
  });
});
