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

test.describe("circuit and help views", () => {
  test("neural circuit tab draws measured edges and inspects a neuron", async ({
    page,
  }) => {
    await openHabitat(page);
    await page.getByRole("tab", { name: "Brain", exact: true }).click();
    await page.getByRole("button", { name: "Neural circuit" }).click();
    const svg = page.locator("svg.network-svg");
    await expect(svg).toBeVisible({ timeout: 30_000 });
    expect(await svg.locator("line").count()).toBeGreaterThan(50);

    const nodes = svg.locator("g[role='button']");
    await expect
      .poll(() => nodes.count(), { timeout: 20_000 })
      .toBeGreaterThan(50);
    await expect(page.locator(".node-details")).toContainText(
      /illustrative, not anatomical/i,
    );
    await nodes.first().click({ force: true });
    // The inspector shows the original MaleCNS body id and transmitter.
    await expect(page.locator(".node-details")).toContainText(/Body ID \d{4,}/);
  });

  test("help and provenance dialogs open", async ({ page }) => {
    await openHabitat(page);
    await page.getByRole("tab", { name: "Brain", exact: true }).click();
    await page.getByRole("button", { name: "How to play" }).click();
    await expect(page.locator("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Close dialog" }).click();

    await page.getByRole("button", { name: /About the model/ }).click();
    const dialog = page.locator("dialog");
    await expect(dialog).toContainText(/not a validated reconstruction/i);
    await expect(
      dialog.getByRole("link", { name: /MaleCNS · Janelia/ }),
    ).toHaveAttribute("href", /male-cns\.janelia\.org/);
  });
});
