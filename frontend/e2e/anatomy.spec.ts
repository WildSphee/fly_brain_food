import { expect, test } from "@playwright/test";
import { openHabitat, watchConsole } from "./habitat";

test("circuit view snaps the real camera and explains neuron roles", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000); // Two WebGL scenes plus desktop/mobile interaction.
  const errors = watchConsole(page);
  // Inspect real camera transforms without exposing production debug globals.
  await page.route("**/src/Network.tsx*", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const marker =
      "const controls = new OrbitControls(camera, renderer.domElement);";
    expect(body).toContain(marker);
    await route.fulfill({
      response,
      body: body.replace(
        marker,
        `${marker}\nwindow.__anatomy = { camera, controls };`,
      ),
    });
  });
  await openHabitat(page);
  await page.getByRole("tab", { name: "Brain", exact: true }).click();
  await page
    .getByRole("button", { name: "Neural circuit", exact: true })
    .click();
  const canvas = page.locator(".anatomy-canvas canvas");
  await expect(canvas).toBeVisible({ timeout: 45000 });
  const pose = () =>
    page.evaluate(() => {
      const { camera, controls } = (window as any).__anatomy;
      return {
        direction: camera.position
          .clone()
          .sub(controls.target)
          .normalize()
          .toArray() as number[],
        distance: camera.position.distanceTo(controls.target) as number,
        target: controls.target.toArray() as number[],
        quaternion: camera.quaternion.toArray() as number[],
      };
    });
  const nav = page.getByRole("group", { name: "View direction" });
  const directions: Record<string, number[]> = {
    Front: [0, 0, 1],
    Back: [0, 0, -1],
    Left: [-1, 0, 0],
    Right: [1, 0, 0],
    Top: [0, 1, 0],
    Bottom: [0, -1, 0],
  };
  for (const [name, direction] of Object.entries(directions)) {
    await nav.getByRole("button", { name, exact: true }).click();
    await expect(
      nav.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const actual = await pose();
    actual.direction.forEach((value, i) =>
      expect(value).toBeCloseTo(direction[i], 5),
    );
    expect(actual.quaternion.every(Number.isFinite)).toBe(true);
  }
  await nav.getByRole("button", { name: "Front", exact: true }).click();
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width * 0.4,
    y = box.y + box.height * 0.55;
  const beforeZoom = await pose();
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -300);
  await expect
    .poll(async () => (await pose()).distance)
    .toBeLessThan(beforeZoom.distance);
  // Pan, then orbit: snapping must preserve the user's center and zoom.
  await page.mouse.down({ button: "right" });
  await page.mouse.move(x + 65, y + 40, { steps: 8 });
  await page.mouse.up({ button: "right" });
  await page.mouse.down();
  await page.mouse.move(x + 150, y + 100, { steps: 8 });
  await page.mouse.up();
  await expect(nav.getByText("Free orbit · view axes")).toBeVisible();
  // Capture at the click itself: damping can still move the center between
  // browser commands, especially under software WebGL.
  await nav
    .getByRole("button", { name: "Top", exact: true })
    .evaluate((button) => {
      button.addEventListener(
        "click",
        () => {
          const { camera, controls } = (window as any).__anatomy;
          (window as any).__beforeSnap = {
            distance: camera.position.distanceTo(controls.target),
            target: controls.target.toArray(),
          };
        },
        { capture: true, once: true },
      );
    });
  await nav.getByRole("button", { name: "Top", exact: true }).click();
  const beforeSnap = await page.evaluate(
    () =>
      (window as any).__beforeSnap as { distance: number; target: number[] },
  );
  expect(Math.hypot(...beforeSnap.target)).toBeGreaterThan(0.01);
  const afterSnap = await pose();
  expect(afterSnap.distance).toBeCloseTo(beforeSnap.distance, 3);
  afterSnap.target.forEach((value, i) =>
    expect(value).toBeCloseTo(beforeSnap.target[i], 3),
  );
  // The gizmo itself supports keyboard activation, including pole views.
  await nav
    .getByRole("button", { name: "Snap to front view", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    nav.getByRole("button", { name: "Front", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect((await pose()).direction[2]).toBeCloseTo(1, 5);

  await expect(page.locator(".anatomy-class-summary")).toHaveText(
    "6 descending · 6 ascending · 32 sensory & local",
  );
  const neurons = page.locator(".anatomy-neurons button");
  await expect(neurons).toHaveCount(44);
  await expect(
    neurons.filter({ has: page.locator("em", { hasText: /^Ascending$/ }) }),
  ).toHaveCount(6);
  await expect(
    neurons.filter({ has: page.locator("em", { hasText: /^Descending$/ }) }),
  ).toHaveCount(6);
  const details = page.locator(".node-details");
  for (const [id, type, role] of [
    ["10010", "DNp01", "Rapid escape takeoff"],
    ["531898", "DNp04", "Escape takeoff coordination"],
    ["10247", "DNg74_a", "Leg sensory-feedback modulation"],
    ["10131", "DNg74_a", "Leg sensory-feedback modulation"],
    ["10038", "pIP1", "Specific motor role unassigned"],
    ["10283", "DNp103", "Specific motor role unassigned"],
  ]) {
    await page
      .getByRole("button", { name: `Neuron ${id} ${type}`, exact: true })
      .click();
    await expect(details.locator(".neuron-class")).toHaveText("Descending");
    await expect(details.locator(".neuron-role")).toContainText(role);
    await expect(details).toContainText(
      "L/R marks anatomical side, not control of a single leg.",
    );
  }
  for (const [id, type, title] of [
    ["11431", "AN05B102a", "Contact-pheromone pathway"],
    ["12286", "AN05B102a", "Contact-pheromone pathway"],
    ["17416", "AN05B102c", "Contact-pheromone pathway"],
    ["46466", "AN05B023a", "Contact-pheromone pathway"],
    ["30088", "AN13B002", "Body chemosensory feedback"],
    ["21763", "AN13B002", "Body chemosensory feedback"],
  ]) {
    await page
      .getByRole("button", { name: `Neuron ${id} ${type}`, exact: true })
      .click();
    await expect(details.locator(".neuron-class")).toHaveText("Ascending");
    await expect(details.locator(".neuron-role")).toContainText(title);
    await expect(details).toContainText("Ventral nerve cord → brain");
    await expect(details.locator(".neuron-role a")).toHaveAttribute(
      "href",
      /^https:\/\//,
    );
  }
  await page
    .getByRole("button", { name: "Neuron 10131 DNg74_a", exact: true })
    .click();
  await expect(details).toContainText("DNg74 family-level study");
  await expect(
    details.getByRole("link", { name: "Dallmann et al., 2025" }),
  ).toHaveAttribute("href", /Dallmann_et_al-2025-Nature.pdf$/);
  await page.screenshot({
    path: testInfo.outputPath("circuit-directions-and-role.png"),
  });
  await page
    .getByRole("button", { name: "Neuron 515900 LC4", exact: true })
    .click();
  await expect(details.locator(".neuron-class")).toHaveText(
    "Visual projection",
  );
  await expect(details.locator(".neuron-role")).toContainText("Visual pathway");
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  const reset = await pose();
  expect(reset.distance).toBeCloseTo(3.4, 5);
  expect(reset.target).toEqual([0, 0, 0]);
  await expect(
    page.locator('.anatomy-neurons button[aria-pressed="true"]'),
  ).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(nav).toBeVisible();
  await nav.getByRole("button", { name: "Left", exact: true }).click();
  expect((await pose()).direction[0]).toBeCloseTo(-1, 5);
  const navBox = (await nav.boundingBox())!;
  expect(navBox.x).toBeGreaterThanOrEqual(0);
  expect(navBox.x + navBox.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("circuit-mobile.png") });
  expect(errors).toEqual([]);
});
