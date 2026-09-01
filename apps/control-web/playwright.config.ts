import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:47650",
    headless: true,
    launchOptions: { executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" }
  },
  webServer: {
    // Run the API directly so Playwright's shutdown signal reaches Fastify and
    // releases the singleton lock instead of stopping only an npm parent.
    command: "node --import tsx apps/control-api/src/server.ts",
    url: "http://127.0.0.1:47650/api/v1/health",
    reuseExistingServer: process.env.AVA_LIVE_ACCEPTANCE === "1" || process.env.AVA_REUSE_EXISTING_SERVER === "1",
    timeout: 30_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    cwd: "../.."
  }
});
