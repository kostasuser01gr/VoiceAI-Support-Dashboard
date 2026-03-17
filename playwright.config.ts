import { defineConfig, devices } from "playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3005);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const command =
  process.env.PLAYWRIGHT_SERVER_COMMAND ??
  `DEMO_SAFE_MODE=true HISTORY_MODE=local NEXT_TELEMETRY_DISABLED=1 npm run dev -- --hostname 127.0.0.1 --port ${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
