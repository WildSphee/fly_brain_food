import { expect, test } from "@playwright/test";
import {
  focusViewport,
  metric,
  openHabitat,
  watchConsole,
} from "./habitat";

test.describe("habitat, cameras, and controls", () => {
  test("loads the 3D habitat without console errors", async ({ page }) => {
    const errors = watchConsole(page);
    await openHabitat(page);
    // A rendered frame means WebGL, the GLB kitchen, and the render loop all work.
    await expect(page.locator(".footer")).toContainText("Habitat ready");
    await expect
      .poll(
        async () => {
          const text = await page.locator(".footer span").first().innerText();
          return Number(text.match(/(\d+)\s*FPS/)?.[1] ?? 0);
        },
        { timeout: 30_000, message: "renderer never reported a frame rate" },
      )
      .toBeGreaterThan(0);
    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
  });

  test("every camera mode switches by click and by keyboard", async ({ page }) => {
    await openHabitat(page);
    for (const [name, hint] of [
      ["Follow camera", /Following specimen/i],
      ["Fly eye camera", /Fly-eye view/i],
      ["Fixed camera", /Fixed observation camera/i],
      ["Orbit camera", /Drag to orbit/i],
    ] as const) {
      await page.getByRole("button", { name }).click();
      await expect(page.locator(".camera-hint")).toContainText(hint);
    }
    // Shortcuts 1-4 documented in the readme and help dialog.
    for (const [key, hint] of [
      ["Digit2", /Following specimen/i],
      ["Digit3", /Fly-eye view/i],
      ["Digit4", /Fixed observation camera/i],
      ["Digit1", /Drag to orbit/i],
    ] as const) {
      await focusViewport(page);
      await page.keyboard.press(key);
      await expect(page.locator(".camera-hint")).toContainText(hint);
    }
  });

  test("pause freezes simulation time and resume advances it", async ({ page }) => {
    await openHabitat(page);
    await expect(page.locator(".live-pill")).toHaveText("LIVE");
    await page.getByRole("button", { name: "Pause simulation" }).click();
    await expect(page.locator(".live-pill")).toHaveText("PAUSED");
    const frozen = await page.locator(".sim-time").first().innerText();
    await page.waitForTimeout(2500);
    expect(await page.locator(".sim-time").first().innerText()).toBe(frozen);

    await focusViewport(page);
    await page.keyboard.press("Space"); // Space resumes.
    await expect(page.locator(".live-pill")).toHaveText("LIVE");
    await expect
      .poll(async () => page.locator(".sim-time").first().innerText(), { timeout: 15_000 })
      .not.toBe(frozen);
  });

  test("manual control flies the specimen with the keyboard", async ({ page }) => {
    await openHabitat(page);
    await page.getByRole("button", { name: "Manual", exact: true }).click();
    await expect(page.locator(".manual-hint")).toBeVisible();
    await focusViewport(page);
    await page.keyboard.down("KeyW");
    await expect
      .poll(() => metric(page, "Speed"), {
        timeout: 20_000,
        message: "holding W did not move the fly",
      })
      .toBeGreaterThan(0);
    await page.keyboard.up("KeyW");
  });

  test("speed selector changes the simulation rate", async ({ page }) => {
    await openHabitat(page);
    const fast = page.locator(".speed-select button", { hasText: "2×" });
    await fast.click();
    await expect(fast).toHaveClass(/selected/);
  });
});

test.describe("food sources", () => {
  test("places a new food by clicking a surface and removes it again", async ({ page }) => {
    await openHabitat(page);
    const rows = page.locator(".food-row");
    await expect(rows).toHaveCount(3);

    await page.getByRole("button", { name: /Add food/ }).click();
    await page.locator(".food-menu button", { hasText: "Aged cheese" }).click();
    await expect(page.locator(".placement-banner")).toBeVisible();

    // Fixed camera looks at the table, so the centre of the view is a placeable surface.
    await page.getByRole("button", { name: "Fixed camera" }).click();
    await page.waitForTimeout(1200);
    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.62);
    await expect(rows).toHaveCount(4, { timeout: 20_000 });
    await expect(page.locator(".placement-banner")).toHaveCount(0);

    await page.getByRole("button", { name: /^Remove Aged cheese/ }).first().click();
    await expect(rows).toHaveCount(3);
  });

  test("Escape cancels an in-progress placement", async ({ page }) => {
    await openHabitat(page);
    await page.getByRole("button", { name: /Add food/ }).click();
    await page.locator(".food-menu button", { hasText: "Ripe banana" }).click();
    await expect(page.locator(".placement-banner")).toBeVisible();
    await focusViewport(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(".placement-banner")).toHaveCount(0);
    await expect(page.locator(".food-row")).toHaveCount(3);
  });
});

test.describe("environment", () => {
  test("time, climate, and appliance controls apply to the world", async ({ page }) => {
    await openHabitat(page);
    const clock = page.locator(".weather-chip");
    await expect(clock).toContainText("10:30");
    await page.getByLabel("Time of day").fill("21");
    await expect(clock).toContainText("21:00");

    await page.getByLabel("Room temperature").fill("36");
    await expect(clock).toContainText("36°C");

    for (const label of ["Stovetop heat", "Fridge cooling", "Open window", "Kitchen light"]) {
      const toggle = page.getByRole("switch", { name: label });
      const before = await toggle.getAttribute("aria-checked");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");
    }
  });

  test("field overlays switch between odor, thermal, and light", async ({ page }) => {
    await openHabitat(page);
    for (const name of ["Odor", "Thermal", "Light", "Natural"]) {
      const button = page.locator(".overlay-grid button", { hasText: name });
      await button.click();
      await expect(button).toHaveClass(/selected/);
    }
  });
});

test.describe("reset", () => {
  test("restores the habitat, food, and options", async ({ page }) => {
    await openHabitat(page);
    await page.getByLabel("Time of day").fill("3");
    await page.getByRole("button", { name: "Fly eye camera" }).click();
    await page.getByRole("button", { name: /Add food/ }).click();
    await page.locator(".food-menu button", { hasText: "Aged cheese" }).click();
    await expect(page.locator(".placement-banner")).toBeVisible();

    await page.getByRole("button", { name: "Reset experiment" }).click();
    await expect(page.locator(".weather-chip")).toContainText("10:30");
    await expect(page.locator(".camera-hint")).toContainText(/Drag to orbit/i);
    await expect(page.locator(".placement-banner")).toHaveCount(0);
    await expect(page.locator(".food-row")).toHaveCount(3);
    await expect(page.locator(".sim-time")).toContainText("00:0");
  });
});

test.describe("responsive layout", () => {
  test.use({ viewport: { width: 414, height: 900 } });
  test("phone width keeps the habitat usable", async ({ page }) => {
    await openHabitat(page);
    // No horizontal overflow at phone width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Toggle environment settings" }).click();
    await expect(page.locator(".sidebar.mobile-open")).toBeVisible();
  });
});
