import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

const presenterPath = path.resolve("../../assets/input/prototype-presenter.png");

test("control API refuses a second process for the same durable store", async () => {
  const projectRoot = path.resolve("../..");
  const child = spawn(process.execPath, ["--import", "tsx", "apps/control-api/src/server.ts"], {
    cwd: projectRoot,
    env: { ...process.env, AVA_CONTROL_PORT: "47653", AVA_LOG_LEVEL: "silent" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  const [code] = await once(child, "close");
  expect(code).not.toBe(0);
  expect(output).toMatch(/locked by|control-api\.lock/);
});

test("a live rejection replaces cached green readiness with the failed dependency", async ({ page }) => {
  const snapshot = (ready: boolean, checks: any[] = []) => {
    const now = Date.now();
    return { ready, checkedAt: new Date(now).toISOString(), expiresAt: new Date(now + 5_000).toISOString(), checks };
  };
  const failedCheck = {
    id: "premiere-heartbeat",
    name: "Premiere bridge heartbeat",
    category: "premiere",
    ok: false,
    blocking: true,
    detail: "heartbeat age 8s (maximum 5s)",
    remediation: "เปิด Premiere และ reload PSU AVA Bridge 0.2.0"
  };

  await page.route("**/api/v1/health", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, readiness: snapshot(true) } });
  });
  await page.route("**/api/v1/readiness", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot(true)) });
  });
  await page.route("**/api/v1/runs", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ code: "READINESS_FAILED", error: "System readiness checks failed; live run was not queued", readiness: snapshot(false, [failedCheck]) })
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "โหลดชุดทดลอง", exact: true }).click();
  await page.getByRole("button", { name: "Validate Recipe" }).click();
  await expect(page.getByText(/Preflight ผ่านแล้ว/)).toBeVisible();
  await page.getByRole("checkbox", { name: /พร้อมสำหรับ Live Adobe/ }).check();
  const live = page.getByRole("button", { name: "Create Video" });
  await expect(live).toBeEnabled();
  await live.click();

  await expect(page.getByRole("alert")).toContainText("ยังไม่เริ่ม Live — Premiere bridge heartbeat: heartbeat age 8s");
  await expect(page.getByRole("heading", { name: "ตรวจพบสิ่งที่ต้องเตรียม" })).toBeVisible();
  await expect(page.getByText("เปิด Premiere และ reload PSU AVA Bridge 0.2.0")).toBeVisible();
  await expect(live).toBeDisabled();
  await expect(page).not.toHaveURL(/\/runs\//);
});

test("guided control center validates boundaries and completes a seven-step dry run", async ({ page, request }) => {
  const healthResponse = await request.get("/api/v1/health");
  expect(healthResponse.ok()).toBeTruthy();
  const health = await healthResponse.json();
  const csrf = health.csrfToken as string;

  const csrfFailure = await request.post("/api/v1/runs", { data: { mode: "dry-run", manifest: {} } });
  expect(csrfFailure.status()).toBe(403);

  const source = await readFile(presenterPath);
  const mimeMismatch = await request.post("/api/v1/assets/import", {
    headers: { "x-ava-csrf": csrf },
    multipart: { file: { name: "wrong.jpg", mimeType: "image/jpeg", buffer: source } }
  });
  expect(mimeMismatch.status()).toBe(415);

  const [trialOne, trialTwo] = await Promise.all([
    request.post("/api/v1/trial-presets/portrait-story-v1", { headers: { "x-ava-csrf": csrf }, data: {} }),
    request.post("/api/v1/trial-presets/portrait-story-v1", { headers: { "x-ava-csrf": csrf }, data: {} })
  ]);
  expect(trialOne.ok()).toBeTruthy();
  expect(trialTwo.ok()).toBeTruthy();
  expect((await trialOne.json()).presenterAsset.assetId).toBe((await trialTwo.json()).presenterAsset.assetId);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /ประกอบวิดีโอให้เสร็จ/ })).toBeVisible();
  await page.getByRole("button", { name: "โหลดชุดทดลอง", exact: true }).click();
  await expect(page.getByText("prototype-presenter.png")).toBeVisible();
  await expect(page.getByText("ชุดทดลองพร้อมแล้ว")).toBeVisible();

  await page.getByRole("button", { name: "Validate Recipe" }).click();
  await expect(page.getByText(/Preflight ผ่านแล้ว/)).toBeVisible();
  await expect(page.getByText(/1080x1920 · 5 วินาที · 7 ขั้นตอน/)).toBeVisible();
  await expect(page.getByText(/"schemaVersion"/)).toHaveCount(0);
  await page.getByLabel("Headline", { exact: true }).fill("UPDATED HEADLINE");
  await expect(page.getByText(/Preflight ผ่านแล้ว/)).toHaveCount(0);
  await page.getByRole("button", { name: "Validate Recipe" }).click();
  await expect(page.getByText(/Preflight ผ่านแล้ว/)).toBeVisible();

  const assetId = await page.locator('img[alt="Presenter preview"]').getAttribute("src").then((value) => value?.split("/").at(-2));
  expect(assetId).toBeTruthy();
  const manifest = {
    manifestVersion: 1,
    recipeId: "portrait-story-v1",
    id: `api-${Date.now()}`,
    projectName: "API Boundary",
    presenterAsset: { assetId, projectPath: "/etc/passwd", originalName: "forged.png", mimeType: "image/png", previewUrl: "" },
    headline: "BOUNDARY",
    subheadline: "SERVER OWNED ASSET",
    backgroundBrief: "calm university broadcast studio background"
  };
  const compile = await request.post("/api/v1/workflows/compile", { headers: { "x-ava-csrf": csrf }, data: { manifest } });
  expect(compile.status()).toBe(200);
  const compileBody = await compile.json();
  expect(compileBody.workflow).toBeUndefined();
  expect(compileBody.raw).toBeUndefined();

  const invalidMode = await request.post("/api/v1/runs", { headers: { "x-ava-csrf": csrf, "idempotency-key": `bad-mode-${Date.now()}` }, data: { manifest, mode: "typo" } });
  expect(invalidMode.status()).toBe(422);
  const missingIdempotency = await request.post("/api/v1/runs", { headers: { "x-ava-csrf": csrf }, data: { manifest, mode: "dry-run" } });
  expect(missingIdempotency.status()).toBe(400);
  const missingPreflight = await request.post("/api/v1/runs", { headers: { "x-ava-csrf": csrf, "idempotency-key": `missing-preflight-${Date.now()}` }, data: { manifest, mode: "live" } });
  expect(missingPreflight.status()).toBe(409);
  expect((await missingPreflight.json()).code).toBe("PREFLIGHT_REQUIRED");
  const stalePreflight = await request.post("/api/v1/runs", { headers: { "x-ava-csrf": csrf, "idempotency-key": `stale-preflight-${Date.now()}` }, data: { manifest, mode: "live", preflightDigest: "stale", operatorConfirmedAdobeReady: true } });
  expect(stalePreflight.status()).toBe(409);
  expect((await stalePreflight.json()).code).toBe("PREFLIGHT_STALE");
  const unconfirmedLive = await request.post("/api/v1/runs", { headers: { "x-ava-csrf": csrf, "idempotency-key": `unconfirmed-live-${Date.now()}` }, data: { manifest, mode: "live", preflightDigest: compileBody.workflowDigest } });
  expect(unconfirmedLive.status()).toBe(409);
  expect((await unconfirmedLive.json()).code).toBe("OPERATOR_CONFIRMATION_REQUIRED");

  await page.getByRole("button", { name: "Dry Run" }).click();
  await expect(page).toHaveURL(/\/runs\//);
  await expect(page.locator(".run-status strong")).toHaveText("success", { timeout: 15_000 });
  await expect(page.locator(".timeline .card-title > span")).toHaveText("7/7");
  await expect(page.getByRole("heading", { name: "Artifacts" })).toBeVisible();

  const runId = page.url().split("/").at(-1)!;
  const runResponse = await request.get(`/api/v1/runs/${runId}`);
  const run = await runResponse.json();
  expect(run.configPath).toBeUndefined();
  expect(run.runDir).toBeUndefined();
  expect(run.idempotencyKey).toBeUndefined();
  expect(run.steps).toHaveLength(7);

  const artifacts = await (await request.get(`/api/v1/runs/${runId}/artifacts`)).json();
  expect(artifacts.length).toBeGreaterThan(0);
  const contentUrl = `/api/v1/runs/${runId}/artifacts/${artifacts[0].artifactId}/content`;
  const partial = await request.get(contentUrl, { headers: { range: "bytes=0-31" } });
  expect(partial.status()).toBe(206);
  expect(partial.headers()["content-range"]).toMatch(/^bytes 0-31\//);
  expect((await partial.body()).length).toBe(32);
  const invalidRange = await request.get(contentUrl, { headers: { range: "bytes=999999999-" } });
  expect(invalidRange.status()).toBe(416);

  await page.getByRole("link", { name: /New job/ }).click();
  await expect(page.getByText("UPDATED HEADLINE")).toHaveCount(0);
  await expect(page.getByText("PSU Portrait Story", { exact: true }).first()).toBeVisible();

  await page.goto("/runs/does-not-exist");
  await expect(page.getByRole("alert")).toContainText("Run not found");
  await expect(page.getByRole("link", { name: /กลับไปหน้าสร้างงาน/ })).toBeVisible();
});
