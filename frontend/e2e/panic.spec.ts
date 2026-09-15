import { expect, test } from "@playwright/test";
import { inspectWorld, openHabitat, watchConsole } from "./habitat";

test("panic toggles fire, light, heat, red rain and faster escape for every fly", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const errors = watchConsole(page);
  await inspectWorld(page);
  await openHabitat(page);
  await page.getByRole("button", { name: "Pause simulation" }).click();
  await page.getByRole("tab", { name: "Environment", exact: true }).click();
  await page.getByLabel("Time of day", { exact: true }).fill("0");
  const toggle = page.getByRole("switch", { name: "Panic mode", exact: true });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  const state = () =>
    page.evaluate(() => {
      const w = (window as any).__world;
      const data = w.backdrop.context.getImageData(
        0,
        0,
        w.backdrop.canvas.width,
        w.backdrop.canvas.height,
      ).data;
      let red = 0,
        green = 0;
      for (let i = 0; i < data.length; i += 4) {
        red += data[i];
        green += data[i + 1];
      }
      return {
        fire: w.panicFire.group.visible,
        lights: w.panicFire.lights.map((l: any) => l.intensity),
        time: w.panicFire.material.uniforms.time.value,
        centerTemp: w.temperatureAt(0, 2, 0),
        wallTemp: w.temperatureAt(-4.3, 2, 0),
        light: w.lightAt(0, 2, 0),
        baseline: [
          w.options.temperature,
          w.options.sunlight,
          w.options.lamp,
          w.options.stove,
          w.options.hour,
        ],
        red,
        green,
      };
    });
  const normal = await state();
  expect(normal.fire).toBe(false);
  expect(normal.green).toBeGreaterThan(normal.red);
  await toggle.click();
  // SwiftShader may spend longer compiling the first visible flame shader.
  await expect
    .poll(async () => (await state()).fire, { timeout: 60_000 })
    .toBe(true);
  const panic = await state();
  expect(panic.centerTemp - normal.centerTemp).toBeGreaterThan(12);
  expect(panic.wallTemp - normal.wallTemp).toBeGreaterThan(
    panic.centerTemp - normal.centerTemp,
  );
  expect(panic.light - normal.light).toBeGreaterThan(0.4);
  expect(panic.lights.every((n: number) => n > 15)).toBe(true);
  expect(panic.red).toBeGreaterThan(panic.green * 3);
  expect(panic.baseline).toEqual(normal.baseline);
  await page.screenshot({ path: testInfo.outputPath("panic-night.png") });
  await page.waitForTimeout(400);
  const paused = await state();
  expect(paused.time).toBe(panic.time);
  expect(paused.lights).toEqual(panic.lights);

  // Compare actual controller + physics from identical positions and motor input.
  const flight = await page.evaluate(() => {
    const w = (window as any).__world;
    const saved = {
      options: w.options,
      motor: w.motor,
      connected: w.connected,
      elapsed: w.elapsed,
    };
    w.connected = true;
    w.motor = { forward: 0.5, turn: 0, lift: 1, feeding: 1 };
    function run(panic: boolean, silenced = false) {
      w.options = {
        ...saved.options,
        panic,
        silenced,
        stove: false,
        fridge: false,
      };
      w.elapsed = 0;
      w.flies.forEach((f: any, i: number) => {
        f.body.setTranslation({ x: -1 + i * 2, y: 2, z: -0.5 }, true);
        f.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        f.body.resetForces(true);
        f.yaw = 0;
        f.energy = 100;
        f.stomach = 100;
        f.seekingFood = false;
      });
      for (let i = 0; i < 60; i++) {
        w.elapsed += 1 / 60;
        for (const f of w.flies) {
          w.steppingFly = f;
          w.step(1 / 60);
        }
        w.physics.timestep = 1 / 60;
        w.physics.step();
      }
      return w.flies.map((f: any) => {
        w.steppingFly = f;
        w.sense();
        const v = f.body.linvel();
        return {
          speed: Math.hypot(v.x, v.z),
          heat: w.sensors.heat,
          light: w.sensors.light_left,
          behavior: f.behavior,
          feeding: f.feedingFood,
        };
      });
    }
    const normal = run(false),
      panic = run(true),
      silenced = run(true, true);
    w.steppingFly = null;
    Object.assign(w, saved);
    return { normal, panic, silenced };
  });
  expect(flight.panic).toHaveLength(2);
  flight.panic.forEach((f: any, i: number) => {
    expect(f.speed).toBeGreaterThan(flight.normal[i].speed * 1.5);
    expect(f.heat).toBeGreaterThan(flight.normal[i].heat);
    expect(f.light).toBeGreaterThan(flight.normal[i].light);
    expect(f.behavior).toBe("Panicking");
    expect(f.feeding).toBeNull();
    expect(flight.silenced[i].speed).toBeLessThan(0.01);
  });

  await toggle.click();
  await expect.poll(async () => (await state()).fire).toBe(false);
  const restored = await state();
  expect(restored.centerTemp).toBe(normal.centerTemp);
  expect(restored.wallTemp).toBe(normal.wallTemp);
  expect(restored.light).toBe(normal.light);
  expect(restored.lights.every((n: number) => n === 0)).toBe(true);
  expect(restored.green).toBeGreaterThan(restored.red);
  expect(restored.baseline).toEqual(normal.baseline);
  await toggle.click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(async () => (await state()).time).toBe(0);
  await page.getByRole("tab", { name: "Simulation", exact: true }).click();
  await page.getByRole("button", { name: "Reset experiment" }).click();
  await page.getByRole("tab", { name: "Environment", exact: true }).click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect.poll(async () => (await state()).fire).toBe(false);

  // Exercise the real fixed-step boundary handling at boosted speed, open window.
  const containment = await page.evaluate(() => {
    const w = (window as any).__world;
    cancelAnimationFrame(w.raf);
    w.options = {
      ...w.options,
      panic: true,
      running: true,
      speed: 2,
      windowOpen: true,
    };
    w.connected = true;
    w.motor = { forward: 1, turn: 0, lift: 1, feeding: 0 };
    w.flies.forEach((f: any, i: number) => {
      f.body.setTranslation({ x: 0.5 + i * 0.3, y: 2.2, z: -3.3 }, true);
      f.yaw = Math.PI;
    });
    w.renderer.render = () => {};
    w.onStats = () => {};
    let violation = 0;
    const start = w.elapsed;
    for (let i = 0; i < 300; i++) {
      w.frame(w.previous + 100);
      cancelAnimationFrame(w.raf);
      for (const f of w.flies) {
        const p = f.body.translation();
        violation = Math.max(
          violation,
          Math.abs(p.x) - 4.46,
          Math.abs(p.z) - 3.46,
          p.y - 3.46,
          -p.y,
        );
      }
    }
    return { violation, duration: w.elapsed - start };
  });
  expect(containment.violation).toBe(0);
  expect(containment.duration).toBeGreaterThan(59);
  expect(errors).toEqual([]);
});
