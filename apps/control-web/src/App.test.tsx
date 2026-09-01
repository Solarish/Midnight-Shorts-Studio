import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";

function readiness(ready = true, checks: any[] = []) {
  const now = Date.now();
  return { ready, checkedAt: new Date(now).toISOString(), expiresAt: new Date(now + 5_000).toISOString(), checks };
}

async function defaultFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  if (url.endsWith("/health")) return new Response(JSON.stringify({ ok: true, csrfToken: "test", readiness: readiness() }), { status: 200 });
  if (url.endsWith("/readiness")) return new Response(JSON.stringify(readiness()), { status: 200 });
  if (url.endsWith("/workflows/packages")) return new Response("[]", { status: 200 });
  if (url.endsWith("/workflows") && (!init?.method || init.method === "GET")) return new Response("[]", { status: 200 });
  if (url.endsWith("/runs") && (!init?.method || init.method === "GET")) return new Response("[]", { status: 200 });
  if (url.endsWith("/trial-presets/portrait-story-v1")) return new Response(JSON.stringify({
    presetId: "portrait-story-first-user-v1",
    presenterAsset: { assetId: "12345678-1234-4123-a123-123456789012", projectPath: "assets/input/ui/trial.png", originalName: "prototype-presenter.png", mimeType: "image/png", width: 1024, height: 1536, previewUrl: "/trial.png" },
    form: { projectName: "PSU First User Trial", headline: "PSU BROADCAST", subheadline: "FIRST USER TRIAL", backgroundBrief: "ห้องส่งข่าวมหาวิทยาลัยสำหรับการทดลองครั้งแรก" }
  }), { status: 200 });
  if (url.endsWith("/workflows/compile")) return new Response(JSON.stringify({ workflowDigest: "digest", compiledSummary: { format: "1080x1920", durationSeconds: 5, steps: 7 } }), { status: 200 });
  return new Response("{}", { status: 200 });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(defaultFetch));
});
afterEach(() => cleanup());

test("root route renders the Workflow Catalog as the primary interface", async () => {
  render(<MemoryRouter initialEntries={["/"]}><App /></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "Workflow catalog" })).toBeInTheDocument();
  expect(screen.getByText("ADMIN · VISUAL WORKFLOWS")).toBeInTheDocument();
});

test("trial preset still requires current validation and operator confirmation before Live", async () => {
  render(<MemoryRouter initialEntries={["/recipes/portrait-story"]}><App /></MemoryRouter>);
  const live = await screen.findByRole("button", { name: "Create Video" });
  expect(live).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "โหลดชุดทดลอง" }));
  expect(await screen.findByDisplayValue("PSU First User Trial")).toBeInTheDocument();
  expect(live).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Validate Recipe" }));
  expect(await screen.findByText("Preflight ผ่านแล้ว")).toBeInTheDocument();
  expect(live).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /พร้อมสำหรับ Live Adobe/ }));
  await waitFor(() => expect(live).toBeEnabled());
});

test("renders the guided portrait story form at /recipes/portrait-story", async () => {
  render(<MemoryRouter initialEntries={["/recipes/portrait-story"]}><App /></MemoryRouter>);
  expect(await screen.findByText("ประกอบวิดีโอให้เสร็จ")).toBeInTheDocument();
  expect(screen.getByLabelText("Headline")).toBeInTheDocument();
});

test("a fresh server rejection replaces stale green readiness with actionable details", async () => {
  const failedCheck = {
    id: "premiere-heartbeat",
    name: "Premiere bridge heartbeat",
    category: "premiere",
    ok: false,
    blocking: true,
    detail: "heartbeat age 8s (maximum 5s)",
    remediation: "เปิด Premiere และ reload PSU AVA Bridge 0.2.0"
  };
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/runs") && init?.method === "POST") {
      return new Response(JSON.stringify({ code: "READINESS_FAILED", error: "System readiness checks failed; live run was not queued", readiness: readiness(false, [failedCheck]) }), { status: 409 });
    }
    return defaultFetch(input, init);
  });

  render(<MemoryRouter initialEntries={["/recipes/portrait-story"]}><App /></MemoryRouter>);
  const live = await screen.findByRole("button", { name: "Create Video" });
  fireEvent.click(screen.getByRole("button", { name: "โหลดชุดทดลอง" }));
  await screen.findByDisplayValue("PSU First User Trial");
  fireEvent.click(screen.getByRole("button", { name: "Validate Recipe" }));
  await screen.findByText("Preflight ผ่านแล้ว");
  fireEvent.click(screen.getByRole("checkbox", { name: /พร้อมสำหรับ Live Adobe/ }));
  await waitFor(() => expect(live).toBeEnabled());
  fireEvent.click(live);

  expect(await screen.findByRole("alert")).toHaveTextContent("ยังไม่เริ่ม Live — Premiere bridge heartbeat: heartbeat age 8s");
  expect(screen.getByRole("heading", { name: "ตรวจพบสิ่งที่ต้องเตรียม" })).toBeInTheDocument();
  expect(screen.getByText("เปิด Premiere และ reload PSU AVA Bridge 0.2.0")).toBeInTheDocument();
  expect(live).toBeDisabled();
});
