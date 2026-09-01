import { expect, test } from "vitest";
import { isReadinessFresh, type Readiness } from "./api";

test("readiness freshness expires at the server-provided boundary", () => {
  const snapshot: Readiness = {
    ready: true,
    checkedAt: "2026-08-26T02:00:00.000Z",
    expiresAt: "2026-08-26T02:00:05.000Z",
    checks: []
  };
  expect(isReadinessFresh(snapshot, Date.parse("2026-08-26T02:00:04.999Z"))).toBe(true);
  expect(isReadinessFresh(snapshot, Date.parse("2026-08-26T02:00:05.000Z"))).toBe(false);
  expect(isReadinessFresh({ ...snapshot, ready: false }, Date.parse("2026-08-26T02:00:01.000Z"))).toBe(false);
});
