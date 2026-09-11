import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Read FRONTEND_PORT from the repository .env without adding a dependency. */
function configuredPort(): string {
  try {
    const text = readFileSync(
      path.resolve(import.meta.dirname, "../.env"),
      "utf8",
    );
    const match = text.match(/^\s*FRONTEND_PORT\s*=\s*(\d+)\s*$/m);
    if (match) return match[1];
  } catch {
    /* .env is optional; fall through to the documented default */
  }
  return "5176";
}

const baseURL =
  process.env.E2E_BASE_URL ||
  `http://127.0.0.1:${process.env.FRONTEND_PORT || configuredPort()}`;

export default defineConfig({
  testDir: "./e2e",
  // The habitat downloads 37 local GLB models and compiles WebGL shaders.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    viewport: { width: 1600, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      // Software WebGL so the habitat renders on a headless VM without a GPU.
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--disable-dev-shm-usage",
      ],
    },
  },
  projects: [
    {
      name: "chromium",
      // Spread the device first so the wider habitat viewport below wins.
      use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1000 } },
    },
  ],
});
