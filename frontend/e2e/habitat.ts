import { expect, type Page } from "@playwright/test";

/** Console/page errors that are not caused by the application. */
const IGNORED = [/favicon/i, /Download the React DevTools/i];

export function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (!IGNORED.some((r) => r.test(text))) errors.push(text);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/** Open the app and wait for physics, 3D assets, and the neural socket. */
export async function openHabitat(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /morning kitchen/i })).toBeVisible();
  // The loading card is removed only after Rapier, the GLB models, and WebGL are ready.
  await expect(page.locator(".loading-scene")).toHaveCount(0, { timeout: 90_000 });
  await expect(page.locator("canvas")).toBeVisible();
}

/** Move focus off buttons so App/world window key handlers accept the event. */
export async function focusViewport(page: Page) {
  await page.locator(".scene-tag").click({ force: true });
}

export function readNumber(text: string | null): number {
  return Number((text || "").replace(/[^0-9.-]/g, ""));
}

/** Value of a labelled metric in the telemetry strip, e.g. "Speed" or "Energy". */
export async function metric(page: Page, label: string): Promise<number> {
  const value = await page
    .locator(".metric", { has: page.getByText(label, { exact: true }) })
    .locator("strong")
    .first()
    .textContent();
  return readNumber(value);
}

export async function meanHz(page: Page): Promise<number> {
  return readNumber(await page.locator(".activity-value").first().textContent());
}
