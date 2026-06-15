import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests for the full stack: the Next.js web app + the authoritative
 * Socket.io game server. Playwright boots both servers (with an in-memory DB so
 * runs are clean) and drives real browser contexts — one per player, which is
 * how the multiplayer flows (e.g. a 3-player Président round) get tested.
 */
export default defineConfig({
  testDir: "./e2e",
  // Shared servers + in-memory DB → run serially.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @gamble/server start",
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { PORT: "3001", DB_PATH: ":memory:", CORS_ORIGIN: "http://localhost:3000" },
    },
    {
      command: "pnpm --filter @gamble/web dev",
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { NEXT_PUBLIC_SERVER_URL: "http://localhost:3001" },
    },
  ],
});
