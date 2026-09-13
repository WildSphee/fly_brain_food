import { expect, test } from "@playwright/test";
import { meanHz, openHabitat, readNumber, watchConsole } from "./habitat";

test.describe("neural service", () => {
  test("connects and reports the real circuit provenance", async ({ page }) => {
    const errors = watchConsole(page);
    await openHabitat(page);
    await page.getByRole("tab", { name: "Brain", exact: true }).click();
    await expect(page.getByText("Connected", { exact: true })).toBeVisible({
      timeout: 45_000,
    });

    // Provenance shown in the UI must match the committed snapshot.
    const counts = page.locator(".neuron-counts");
    await expect(counts).toContainText("4,390");
    await expect(counts).toContainText("5.20");
    await expect(page.locator(".model-badge")).toContainText("MaleCNS");

    const summary = await page.request
      .get("/api/circuit")
      .then((r) => r.json());
    expect(summary.dataset).toBe("male-cns:v1.0");
    expect(summary.neurons).toBe(4390);
    expect(summary.synapses).toBe(5202110);
    expect(summary.descending_neurons).toBe(259);
    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
  });

  test("streams live telemetry driven by the circuit", async ({ page }) => {
    await openHabitat(page);
    await page.getByRole("tab", { name: "Brain", exact: true }).click();
    await expect
      .poll(() => meanHz(page), { timeout: 45_000 })
      .toBeGreaterThan(0);
    await expect
      .poll(
        async () =>
          readNumber(
            await page.locator(".chart-legend span").last().textContent(),
          ),
        { timeout: 30_000, message: "no neurons reported firing" },
      )
      .toBeGreaterThan(0);
    // Descending-neuron readout is the motor bridge; it must carry a rate.
    await expect
      .poll(
        async () =>
          readNumber(
            await page.locator(".motor-columns strong").first().textContent(),
          ),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);
  });

  test("silencing all neurons is causal: activity and motor output collapse", async ({
    page,
  }) => {
    await openHabitat(page);
    await page.getByRole("tab", { name: "Brain", exact: true }).click();
    await expect
      .poll(() => meanHz(page), { timeout: 45_000 })
      .toBeGreaterThan(0);

    await page.getByRole("switch", { name: "Silence all neurons" }).click();
    await expect.poll(() => meanHz(page), { timeout: 30_000 }).toBe(0);
    await expect
      .poll(
        async () =>
          readNumber(
            await page.locator(".motor-columns strong").first().textContent(),
          ),
        { timeout: 30_000 },
      )
      .toBe(0);

    await page.getByRole("switch", { name: "Silence all neurons" }).click();
    await expect
      .poll(() => meanHz(page), { timeout: 45_000 })
      .toBeGreaterThan(0);
  });

  // Documented limitation: removing sensory drive does NOT stop the circuit, because
  // this bounded subgraph is excitation-dominant and holds a self-sustaining state.
  // Only the silencing intervention above clears it. See docs/science.md.
  test("sensory gain of zero leaves the recurrent state running", async ({
    page,
  }) => {
    await openHabitat(page);
    await page.getByRole("tab", { name: "Brain", exact: true }).click();
    await expect
      .poll(() => meanHz(page), { timeout: 45_000 })
      .toBeGreaterThan(0);
    await page.getByLabel("Sensory gain").fill("0");
    await expect(page.locator(".interventions .slider-label")).toContainText(
      "0.0",
    );
    await page.waitForTimeout(5000);
    expect(await meanHz(page)).toBeGreaterThan(0);
  });
});

test("anatomical circuit uses measured skeletons and selects a real neuron", async ({
  page,
}, testInfo) => {
  await openHabitat(page);
  await page.getByRole("tab", { name: "Brain", exact: true }).click();
  await page
    .getByRole("button", { name: "Neural circuit", exact: true })
    .click();
  await expect(page.locator(".anatomy-canvas canvas")).toBeVisible({
    timeout: 45000,
  });
  await expect(
    page.getByText("MALE CNS · RECONSTRUCTED ANATOMY"),
  ).toBeVisible();
  const neurons = page.locator(".anatomy-neurons button");
  expect(await neurons.count()).toBeGreaterThan(30);
  await neurons.first().click();
  await expect(page.locator(".node-details")).toContainText(/Body ID \d{4,}/);
  await expect(neurons.first()).toHaveAttribute("aria-pressed", "true");
  const links = page.locator(".anatomy-connections");
  await links.locator("summary").click();
  await expect(links.locator("button").first()).toBeVisible();
  const partner = await links
    .locator("button")
    .first()
    .getAttribute("data-neuron-id");
  await links.locator("button").first().click();
  await expect(page.locator(".node-details")).toContainText(
    `Body ID ${partner}`,
  );
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await expect(neurons.first()).toHaveAttribute("aria-pressed", "false");
  await page.screenshot({
    path: testInfo.outputPath("anatomical-circuit.png"),
  });
  await expect(
    page.getByRole("link", { name: /MaleCNS · FlyEM/ }),
  ).toHaveAttribute("href", "https://male-cns.janelia.org/download/");
  await page.getByRole("button", { name: "Close neural circuit" }).click();
  await expect(page.locator(".anatomy-canvas")).toHaveCount(0);
});

test("selected fly owns the left telemetry and simplified controls", async ({
  page,
}) => {
  await openHabitat(page);
  await expect(page.locator(".fly-item")).toHaveCount(2);
  const left = page.getByRole("complementary", { name: "Flies", exact: true });
  for (const label of ["Speed", "Height", "Energy", "Hunger"])
    await expect(left.getByText(label, { exact: true })).toBeVisible();
  await expect(
    left.getByRole("switch", { name: "Flight trail" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Select fly 2" }).click();
  await expect(page.getByLabel("Fly 2 stats", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Fly 1 stats", { exact: true })).toHaveCount(0);
  for (const name of [
    "Manual",
    "Fixed camera",
    "How to play",
    "About the model",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
      0,
    );
  await expect(page.locator(".camera-grid button")).toHaveCount(3);
  await left.getByRole("switch", { name: "Flight trail" }).click();
  await expect(
    left.getByRole("switch", { name: "Flight trail" }),
  ).toHaveAttribute("aria-checked", "false");
});
