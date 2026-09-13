import { expect, test } from "@playwright/test";
import {
  openHabitat,
  focusViewport,
  watchConsole,
  inspectWorld,
  point,
} from "./habitat";

test("clean layout, cameras, speed, pause, and minimizing", async ({
  page,
}) => {
  const errors = watchConsole(page);
  await openHabitat(page);
  await expect(page).toHaveTitle("Fly Matrix");
  await expect(page.getByText("Experiment log")).toHaveCount(0);
  for (const [name, label] of [
    ["Follow", "Following fly 1"],
    ["Fly eye", "Fly 1 eye"],
    ["Orbit", "Orbit"],
  ]) {
    await page
      .getByRole("button", { name: `${name} camera`, exact: true })
      .click();
    await expect(page.locator(".camera-hint")).toHaveText(label);
  }
  await focusViewport(page);
  await page.keyboard.press("Digit2");
  await expect(page.locator(".camera-hint")).toHaveText("Following fly 1");
  await page.getByRole("button", { name: "2× speed", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "2× speed", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Pause simulation" }).click();
  await expect(
    page.getByRole("button", { name: "Resume simulation" }),
  ).toBeVisible();
  await page.waitForTimeout(300); // Let the final telemetry snapshot arrive.
  const frozen = await page.locator(".sim-time").innerText();
  await page.waitForTimeout(1100);
  expect(await page.locator(".sim-time").innerText()).toBe(frozen);
  await page.getByRole("button", { name: "Minimize settings" }).click();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await page.getByRole("button", { name: "Expand settings" }).click();
  await expect(page.getByRole("tablist")).toBeVisible();
  expect(errors).toEqual([]);
});

test("multiple flies have distinct colors and positions; selected fly is tracked; reset clears extras", async ({
  page,
}) => {
  await inspectWorld(page);
  await openHabitat(page);
  await page.getByRole("button", { name: "Pause simulation" }).click();
  await page.getByRole("button", { name: "Add fly", exact: true }).click();
  await page.getByRole("button", { name: "Add fly", exact: true }).click();
  await expect(page.locator(".fly-item")).toHaveCount(4);
  const flies = await page.evaluate(() =>
    (window as any).__world.flies.map((f: any) => ({
      color: f.color,
      p: f.body.translation(),
    })),
  );
  expect(new Set(flies.map((f: any) => f.color)).size).toBe(4);
  expect(new Set(flies.map((f: any) => JSON.stringify(f.p))).size).toBe(4);
  await page.getByRole("button", { name: "Select fly 3" }).click();
  await page
    .getByRole("button", { name: "Follow camera", exact: true })
    .click();
  await expect(page.locator(".camera-hint")).toHaveText("Following fly 3");
  await page.getByRole("button", { name: "Reset experiment" }).click();
  await expect(page.locator(".fly-item")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Select fly 1" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("drag a fly and apple; direct appliance clicks update settings and visuals", async ({
  page,
}) => {
  await inspectWorld(page);
  await openHabitat(page);
  await page.getByRole("button", { name: "Pause simulation" }).click();
  await page.getByRole("button", { name: "Orbit camera", exact: true }).click();
  const flyPos = await page.evaluate(() => {
    const p = (window as any).__world.body.translation();
    return [p.x, p.y + 0.045, p.z];
  });
  const fly = await point(page, flyPos);
  await page.mouse.move(fly.x, fly.y);
  await page.mouse.down();
  await page.mouse.move(fly.x + 70, fly.y - 30, { steps: 10 });
  await page.mouse.up();
  const moved = await page.evaluate(() => {
    const w = (window as any).__world;
    return { p: w.body.translation(), type: w.body.bodyType(), drag: w.drag };
  });
  expect(Math.abs(moved.p.x - flyPos[0])).toBeGreaterThan(0.1);
  expect(moved.type).toBe(0);
  expect(moved.drag).toBeNull();
  const apple = await point(page, [0.5, 1.36, 0.6]);
  await page.mouse.move(apple.x, apple.y);
  await page.mouse.down();
  await page.mouse.move(apple.x + 45, apple.y + 15, { steps: 10 });
  await page.mouse.up();
  expect(
    await page.evaluate(() =>
      Math.abs(
        (window as any).__world.foods.find((f: any) => f.kind === "apple").x -
          0.5,
      ),
    ),
  ).toBeGreaterThan(0.1);
  await page.getByRole("tab", { name: "Environment", exact: true }).click();
  for (const [pos, label, key] of [
    [[0.1, 2.72, 0.5], "Kitchen light", "lamp"],
    [[3.25, 1.08, -2.88], "Stovetop heat", "stove"],
    [[-3.85, 1, -0.95], "Fridge open", "fridge"],
    [[0.55, 2.6, -3.67], "Open window", "windowOpen"],
  ] as const) {
    const before = await page
      .getByRole("switch", { name: label, exact: true })
      .getAttribute("aria-checked");
    const p = await point(page, [...pos]);
    await page.mouse.click(p.x, p.y);
    await expect(
      page.getByRole("switch", { name: label, exact: true }),
    ).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");
    expect(
      await page.evaluate((key) => (window as any).__world.options[key], key),
    ).toBe(before !== "true");
  }
  await page.getByRole("switch", { name: "Stovetop heat" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__world.kitchen.flames.visible),
    )
    .toBe(true);
  await page.getByRole("switch", { name: "Fridge open" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Math.abs((window as any).__world.kitchen.fridgeDoors[0].rotation.y),
      ),
    )
    .toBeGreaterThan(1);
});

test("all flies stay inside through extended 2× flight at the open window", async ({
  page,
}) => {
  await inspectWorld(page);
  await openHabitat(page);
  await page.getByRole("button", { name: "Add fly", exact: true }).click();
  // Deterministically run 120 simulated seconds through the actual fixed-step frame loop.
  const result = await page.evaluate(() => {
    const w = (window as any).__world;
    cancelAnimationFrame(w.raf);
    w.options = { ...w.options, speed: 2, windowOpen: true };
    w.connected = true;
    w.motor = { forward: 1, turn: 0, lift: 1, feeding: 0 };
    w.flies.forEach((f: any, i: number) => {
      f.body.setTranslation({ x: 0.5 + i * 0.3, y: 2.2, z: -3.3 }, true);
      f.yaw = Math.PI;
    });
    let maxViolation = 0;
    const started = w.elapsed;
    // Disable only rendering/telemetry overhead during accelerated physics verification.
    w.renderer.render = () => {};
    w.onStats = () => {};
    for (let i = 0; i < 600; i++) {
      w.frame(w.previous + 100);
      cancelAnimationFrame(w.raf);
      for (const f of w.flies) {
        const p = f.body.translation();
        maxViolation = Math.max(
          maxViolation,
          Math.abs(p.x) - 4.46,
          Math.abs(p.z) - 3.46,
          p.y - 3.46,
          -p.y,
        );
      }
    }
    return {
      maxViolation,
      elapsed: w.elapsed - started,
      count: w.flies.length,
    };
  });
  expect(result.count).toBe(3);
  expect(result.elapsed).toBeGreaterThan(110);
  expect(result.maxViolation).toBe(0);
});

test("environment food placement, overlays, and video download", async ({
  page,
}) => {
  await inspectWorld(page);
  await openHabitat(page);
  await page.getByRole("tab", { name: "Environment", exact: true }).click();
  await page.getByLabel("Time of day", { exact: true }).fill("21");
  await expect(page.locator(".weather-chip")).toHaveText("21:00");
  await page.getByLabel("Room temperature", { exact: true }).fill("36");
  await page
    .getByRole("button", { name: "Add Aged cheese", exact: true })
    .click();
  const p = await point(page, [0, 1.25, 1]);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator(".food-row")).toHaveCount(4);
  await page.getByRole("button", { name: /Remove Aged cheese/ }).click();
  await expect(page.locator(".food-row")).toHaveCount(3);
  for (const name of ["Odor", "Thermal", "Light", "Natural"]) {
    const b = page.getByRole("button", { name, exact: true });
    await b.click();
    await expect(b).toHaveClass(/selected/);
  }
  await page.getByRole("tab", { name: "Simulation", exact: true }).click();
  await page.getByRole("button", { name: "Record video", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop & save video", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(2200);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Stop & save video", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^fly-matrix-.*\.(webm|mp4)$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  expect(Buffer.concat(chunks).length).toBeGreaterThan(1000);
  await expect(
    page.getByRole("button", { name: "Record video", exact: true }),
  ).toBeVisible();
});

test("phone controls collapse and keep the habitat accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 414, height: 900 });
  await openHabitat(page);
  await expect(
    page.getByRole("button", { name: "Expand settings" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Add fly", exact: true }).click();
  await expect(page.locator(".fly-item")).toHaveCount(3);
  await page.getByRole("button", { name: "Expand settings" }).click();
  await expect(page.getByRole("tablist")).toBeVisible();
});
