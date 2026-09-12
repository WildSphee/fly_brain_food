import { expect, type Page } from "@playwright/test";
export function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon/i.test(m.text()))
      errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}
export async function openHabitat(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Kitchen", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".loading-scene")).toHaveCount(0, {
    timeout: 90000,
  });
  await expect(page.locator("canvas")).toBeVisible();
}
export async function focusViewport(page: Page) {
  await page.locator("canvas").focus();
}
export function readNumber(text: string | null) {
  return Number((text || "").replace(/[^0-9.-]/g, ""));
}
export async function metric(page: Page, label: string) {
  return readNumber(
    await page
      .locator(".metric", { has: page.getByText(label, { exact: true }) })
      .locator("strong")
      .textContent(),
  );
}
export async function meanHz(page: Page) {
  return readNumber(
    await page.locator(".activity-value").first().textContent(),
  );
}
// Instrument the served module only in tests; production exposes no world globals.
export async function inspectWorld(page: Page) {
  await page.route("**/src/world.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        `\nconst originalCreate = KitchenWorld.create; KitchenWorld.create = async (...args) => { const world = await originalCreate(...args); window.__world = world; return world; };`,
    });
  });
}
export async function point(page: Page, position: number[]) {
  return page.evaluate(async (position) => {
    const w = (window as any).__world;
    const v = w.camera.position
      .clone()
      .set(...position)
      .project(w.camera);
    const r = w.renderer.domElement.getBoundingClientRect();
    return {
      x: r.x + ((v.x + 1) * r.width) / 2,
      y: r.y + ((1 - v.y) * r.height) / 2,
    };
  }, position);
}
