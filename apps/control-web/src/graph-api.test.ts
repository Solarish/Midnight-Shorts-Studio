import { afterEach, expect, test, vi } from "vitest";
import { runVisualWorkflow } from "./graph-api";

afterEach(() => vi.unstubAllGlobals());

test("uses the caller's stable run idempotency key", async () => {
  const requests: RequestInit[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/health")) return new Response(JSON.stringify({ ok: true, csrfToken: "test" }), { status: 200 });
    requests.push(init ?? {});
    return new Response(JSON.stringify({ runId: "run-1" }), { status: 200 });
  }));

  await runVisualWorkflow("workflow-1", { mode: "dry-run", operatorConfirmedAdobeReady: false }, "graph-run-stable");

  expect(new Headers(requests[0]?.headers).get("idempotency-key")).toBe("graph-run-stable");
});
