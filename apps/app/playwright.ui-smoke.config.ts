import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/ui-smoke",
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:2138",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      "bun run build:web && bun run preview -- --host 127.0.0.1 --port 2138",
    cwd: ".",
    port: 2138,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
