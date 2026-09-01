import { expect, test } from "@playwright/test";

const liveAcceptanceEnabled = process.env.AVA_LIVE_ACCEPTANCE === "1";

test.skip(!liveAcceptanceEnabled, "Set AVA_LIVE_ACCEPTANCE=1 to authorize a real Adobe/ComfyUI run");

test("first-user preset completes one live seven-step assembly", async ({ page, request }) => {
  test.setTimeout(30 * 60_000);

  const readinessResponse = await request.get("/api/v1/readiness");
  expect(readinessResponse.ok()).toBeTruthy();
  const readiness = await readinessResponse.json();
  expect(readiness.ready, JSON.stringify(readiness.checks, null, 2)).toBe(true);

  await page.goto("/");
  await page.getByRole("button", { name: "โหลดชุดทดลอง", exact: true }).click();
  await expect(page.getByText("ชุดทดลองพร้อมแล้ว")).toBeVisible();

  await page.getByRole("button", { name: "Validate Recipe" }).click();
  await expect(page.getByText(/Preflight ผ่านแล้ว/)).toBeVisible();
  await page.getByRole("checkbox", { name: /พร้อมสำหรับ Live Adobe/ }).check();

  const createVideo = page.getByRole("button", { name: "Create Video" });
  await expect(createVideo).toBeEnabled();
  await createVideo.click();
  await expect(page).toHaveURL(/\/runs\//);

  const runId = page.url().split("/").at(-1)!;
  console.log(`LIVE_RUN_ID=${runId}`);

  let run: Record<string, any> = {};
  await expect.poll(async () => {
    const response = await request.get(`/api/v1/runs/${runId}`);
    expect(response.ok()).toBeTruthy();
    run = await response.json();
    return run.status;
  }, {
    timeout: 29 * 60_000,
    intervals: [1_000, 2_000, 5_000]
  }).toMatch(/^(success|failed|partial|needs_attention)$/);

  expect(run.status, JSON.stringify(run, null, 2)).toBe("success");
  expect(run.dryRun).toBe(false);
  expect(run.steps).toHaveLength(7);
  expect(run.steps.every((step: { status: string }) => step.status === "success")).toBe(true);
  expect(run.verification).toMatchObject({ status: "passed", passed: 30, failed: 0, total: 30 });

  const artifactsResponse = await request.get(`/api/v1/runs/${runId}/artifacts`);
  expect(artifactsResponse.ok()).toBeTruthy();
  const artifacts = await artifactsResponse.json();
  expect(artifacts.some((artifact: { name: string }) => artifact.name.endsWith(".mov"))).toBe(true);
  expect(artifacts.some((artifact: { name: string }) => artifact.name.endsWith(".prproj"))).toBe(true);
  expect(artifacts.some((artifact: { name: string }) => artifact.name === "prototype-evidence.json")).toBe(true);

  await page.reload();
  await expect(page.locator(".run-status strong")).toHaveText("success");
  await expect(page.locator(".timeline .card-title > span")).toHaveText("7/7");
  await expect(page.getByText("30/30 checks passed")).toBeVisible();
});
