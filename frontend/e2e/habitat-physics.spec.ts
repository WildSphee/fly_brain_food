import { expect, test } from "@playwright/test";
import { inspectWorld, openHabitat, watchConsole } from "./habitat";

test.beforeEach(async ({ page }) => {
  await inspectWorld(page);
  await openHabitat(page);
  await page.getByRole("button", { name: "Pause simulation" }).click();
});

test("anatomical flies and textured plants render with local assets", async ({
  page,
}, testInfo) => {
  const result = await page.evaluate(() => {
    const w = (window as any).__world;
    const plants: any[] = [];
    w.scene.traverse((n: any) => {
      if (n.name === "pottedPlant" || n.name.startsWith("plantSmall"))
        plants.push(n);
    });
    const plantMaps: boolean[] = [];
    plants.forEach((p) =>
      p.traverse((n: any) => {
        if (n.isMesh)
          plantMaps.push(
            !!n.material.map?.image && !!n.material.normalMap?.image,
          );
      }),
    );
    return {
      plants: plants.length,
      plantMaps,
      wings: w.flies[0].visual.wings.length,
      eyes: !!w.flies[0].visual.group.getObjectByName("body_red"),
    };
  });
  expect(result.plants).toBe(4);
  expect(result.plantMaps.every(Boolean)).toBe(true);
  expect(result.wings).toBe(2);
  expect(result.eyes).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("matrix-and-plants.png") });
  await page.evaluate(() => {
    const w = (window as any).__world;
    cancelAnimationFrame(w.raf);
    const p = w.agent.visual.group.position;
    w.camera.position.set(p.x + 0.32, p.y + 0.2, p.z + 0.32);
    w.camera.lookAt(p.x, p.y - 0.015, p.z - 0.025);
    w.renderer.render(w.scene, w.camera);
  });
  await page.screenshot({ path: testInfo.outputPath("anatomical-fly.png") });
});

test("flies start differently, seek before serious hunger, and both eat without shared taste", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const w = (window as any).__world;
    cancelAnimationFrame(w.raf);
    w.reset();
    await w.syncFoods();
    w.connected = true;
    w.options = { ...w.options, running: true, stove: false, fridge: false };
    const initial = w.flies.map((f: any) => ({
      position: { ...f.body.translation() },
      yaw: f.yaw,
      stomach: f.stomach,
      energy: f.energy,
      seeking: f.seekingFood,
    }));
    // Actual default operating drive, with no taste from the selected fly.
    w.motor = { forward: 0.55, turn: 0, lift: 0, feeding: 0 };
    const meals = [false, false];
    const lowest = w.flies.map((f: any) => f.stomach);
    const path: any[] = [];
    w.renderer.render = () => {};
    for (let i = 0; i < 1200; i++) {
      w.frame(w.previous + 100);
      cancelAnimationFrame(w.raf);
      w.flies.forEach((f: any, j: number) => {
        meals[j] ||= f.feedingFood !== null;
        lowest[j] = Math.min(lowest[j], f.stomach);
      });
      if (i % 200 === 0)
        path.push(
          w.flies.map((f: any) => ({
            position: { ...f.body.translation() },
            stomach: f.stomach,
            behavior: f.behavior,
          })),
        );
    }
    const final = w.flies.map((f: any) => ({
      stomach: f.stomach,
      energy: f.energy,
      position: { ...f.body.translation() },
    }));
    // A 10% hunger threshold means 89% fullness starts seeking immediately.
    w.stomach = 89;
    w.agent.seekingFood = false;
    w.step(1 / 60);
    const earlySearch = w.agent.seekingFood;
    // Silencing must still remove autonomous drive even during hunger/contact.
    const food = w.foods[0];
    w.body.setTranslation({ x: food.x, y: food.y + 0.05, z: food.z }, true);
    w.options.silenced = true;
    w.step(1 / 60);
    const silent = { feeding: w.agent.feedingFood, forces: w.body.userForce() };
    return { initial, meals, lowest, final, earlySearch, silent, path };
  });
  expect(result.initial[0].position.y).not.toBe(result.initial[1].position.y);
  expect(
    Math.hypot(
      result.initial[0].position.x - result.initial[1].position.x,
      result.initial[0].position.z - result.initial[1].position.z,
    ),
  ).toBeGreaterThan(3);
  expect(result.initial.map((f: any) => f.stomach)).toEqual([76, 94]);
  expect(result.initial.map((f: any) => f.seeking)).toEqual([true, false]);
  expect(result.initial[0].energy).not.toBe(result.initial[1].energy);
  expect(result.meals, JSON.stringify(result)).toEqual([true, true]);
  expect(Math.min(...result.lowest)).toBeGreaterThan(60);
  expect(result.final.every((f: any) => f.energy > 85)).toBe(true);
  expect(result.earlySearch).toBe(true);
  expect(result.silent.feeding).toBeNull();
  expect(result.silent.forces.y).toBe(0);
});

test("props stop a falling fly, and fridge colliders follow animated doors", async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const w = (window as any).__world;
    cancelAnimationFrame(w.raf);
    w.connected = true;
    const landings = [];
    for (const [x, z] of [
      [-3.51, -2.91],
      [-2.55, -2.89],
      [0.025, -2.92],
    ]) {
      w.body.setTranslation({ x, y: 2.5, z }, true);
      w.body.setLinvel({ x: 0, y: -0.1, z: 0 }, true);
      w.body.resetForces(true);
      for (let i = 0; i < 180; i++) {
        w.physics.timestep = 1 / 60;
        w.physics.step();
      }
      landings.push(w.body.translation().y);
    }
    const props = new Set(
      w.kitchen.propColliders.map(({ mesh }: any) => {
        let n = mesh;
        while (n.parent && n.parent !== w.scene) n = n.parent;
        return n.name;
      }),
    );
    return { landings, props: [...props], foodColliders: w.foodColliders.size };
  });
  for (const y of result.landings.slice(0, 2)) expect(y).toBeGreaterThan(1.12);
  expect(result.landings[2]).toBeGreaterThan(0.85);
  expect(result.landings[2]).toBeLessThan(0.95);
  for (const name of [
    "kitchenSink",
    "toaster",
    "kitchenCoffeeMachine",
    "stoolBar",
    "pot",
    "pan",
    "mug",
    "bowl",
    "pottedPlant",
  ])
    expect(result.props).toContain(name);
  expect(result.foodColliders).toBe(3);
  const doors = await page.evaluate(() => {
    const w = (window as any).__world;
    const before = w.kitchen.movingColliders.map(({ collider }: any) => ({
      ...collider.translation(),
      rotation: collider.rotation(),
    }));
    w.options.fridge = !w.options.fridge;
    const render = w.renderer.render;
    w.renderer.render = () => {};
    for (let i = 0; i < 20; i++) {
      w.frame(w.previous + 100);
      cancelAnimationFrame(w.raf);
    }
    w.renderer.render = render;
    return w.kitchen.movingColliders.map(
      ({ mesh, collider }: any, i: number) => {
        const p = collider.translation(),
          actual = mesh.getWorldPosition(mesh.position.clone());
        return {
          moved:
            Math.hypot(p.x - before[i].x, p.z - before[i].z) +
            Math.abs(collider.rotation().y - before[i].rotation.y),
          error: Math.hypot(p.x - actual.x, p.y - actual.y, p.z - actual.z),
        };
      },
    );
  });
  expect(doors.some((d: any) => d.moved > 0.1)).toBe(true);
  expect(Math.max(...doors.map((d: any) => d.error))).toBeLessThan(0.001);
});

test("stomach refills, meals leave persistent food that rots, and reset restores fresh food", async ({
  page,
}) => {
  await expect(page.getByText("Hunger", { exact: true })).toBeVisible();
  await expect(page.getByText("Stomach", { exact: true })).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const w = (window as any).__world;
    cancelAnimationFrame(w.raf);
    w.connected = true;
    w.motor = { forward: 0, turn: 0, lift: 0, feeding: 1 };
    w.options = {
      ...w.options,
      stove: false,
      fridge: false,
    };
    w.addFly();
    const otherBefore = w.flies[1].stomach;
    w.agent.energy = 30;
    w.agent.stomach = 20;
    const food = w.foods[0];
    const place = (near: boolean) =>
      w.body.setTranslation(
        {
          x: near ? food.x - 0.2 : 0,
          y: near ? food.y + 0.05 : 2,
          z: near ? food.z : 2.9,
        },
        true,
      );
    place(true);
    for (let i = 0; i < 180; i++) w.step(1 / 60);
    const during = {
      stomach: w.stomach,
      energy: w.energy,
      remaining: food.remaining,
      particles: w.particles.particles.map((p: any) => p.kind),
      meals: food.meals,
    };
    place(false);
    w.step(1 / 60);
    const afterMeal = { ...food };
    const stomach = w.stomach;
    for (let i = 0; i < 3600; i++) {
      w.step(1 / 60);
      w.ageFoods(1 / 60);
      w.particles.step(1 / 60);
    }
    const aged = {
      ...food,
      scale:
        w.foodMeshes.get(food.id).scale.x /
        w.foodMeshes.get(food.id).userData.baseScale,
    };
    const drained = w.stomach;
    place(true);
    for (let i = 0; i < 60; i++) w.step(1 / 60);
    place(false);
    w.step(1 / 60);
    const second = { ...food };
    const otherStomach = w.flies[1].stomach;
    w.ageFoods(600);
    const composted = !w.foods.some((f: any) => f.id === food.id);
    w.reset();
    await w.syncFoods();
    return {
      during,
      afterMeal,
      aged,
      stomach,
      drained,
      second,
      otherStomach,
      otherBefore,
      composted,
      reset: w.foods,
      colliders: w.foodColliders.size,
      particleCount: w.particles.particles.length,
    };
  });
  expect(result.during.stomach).toBeCloseTo(35, 1);
  expect(result.during.energy).toBeGreaterThan(38);
  expect(result.during.remaining).toBe(1);
  expect(result.during.particles).toContain("eating");
  expect(result.afterMeal.meals).toBe(1);
  expect(result.afterMeal.remaining).toBe(1);
  expect(result.aged.remaining).toBeGreaterThan(0.85);
  expect(result.aged.remaining).toBeLessThan(1);
  expect(result.aged.freshness).toBeLessThan(result.afterMeal.freshness);
  expect(result.aged.scale).toBeLessThan(1);
  expect(result.drained).toBeLessThan(result.stomach);
  expect(result.second.meals).toBe(2);
  expect(result.second.freshness).toBeLessThan(result.aged.freshness);
  expect(result.otherStomach).toBe(result.otherBefore);
  expect(result.composted).toBe(true);
  expect(result.reset).toHaveLength(3);
  expect(
    result.reset.every(
      (f: any) => f.remaining === 1 && f.freshness === 1 && f.meals === 0,
    ),
  ).toBe(true);
  expect(result.colliders).toBe(3);
  expect(result.particleCount).toBe(0);
});

test("wider stove heat, cold, and impacts emit hurt particles; pause freezes effects", async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const w = (window as any).__world;
    cancelAnimationFrame(w.raf);
    w.connected = true;
    w.motor = { forward: 0, turn: 0, lift: 0, feeding: 1 };
    w.options = {
      ...w.options,
      running: false,
      temperature: 24,
      stove: true,
      fridge: false,
    };
    w.body.setTranslation({ x: 2, y: 1.4, z: -2.8 }, true);
    w.energy = 100;
    for (let i = 0; i < 60; i++) w.step(1 / 60);
    const hot = {
      energy: w.energy,
      behavior: w.behavior,
      particles: w.particles.particles.map((p: any) => p.kind),
    };
    w.options.stove = false;
    w.energy = 100;
    w.particles.clear();
    w.agent.hurtCooldown = 0;
    for (let i = 0; i < 60; i++) w.step(1 / 60);
    const off = { energy: w.energy, particles: w.particles.particles.length };
    w.options.temperature = 10;
    for (let i = 0; i < 60; i++) w.step(1 / 60);
    const cold = w.particles.particles.some((p: any) => p.kind === "hurt");
    const life = w.particles.particles[0].life;
    const render = w.renderer.render;
    w.renderer.render = () => {};
    for (let i = 0; i < 10; i++) {
      w.frame(w.previous + 100);
      cancelAnimationFrame(w.raf);
    }
    const pausedLife = w.particles.particles[0].life;
    w.options = { ...w.options, running: true, temperature: 24 };
    w.agent.hurtCooldown = 0;
    w.particles.clear();
    w.body.resetForces(true);
    w.body.setTranslation({ x: 3, y: 0.3, z: 2.8 }, true);
    w.body.setLinvel({ x: 0, y: -3, z: 0 }, true);
    for (let i = 0; i < 5; i++) {
      w.frame(w.previous + 100);
      cancelAnimationFrame(w.raf);
    }
    const impact = w.particles.particles.some((p: any) => p.kind === "hurt");
    w.renderer.render = render;
    return { hot, off, cold, life, pausedLife, impact };
  });
  expect(result.hot.energy).toBeLessThan(99.6);
  expect(result.hot.behavior).toBe("Hurt");
  expect(result.hot.particles).toContain("hurt");
  expect(result.off.energy).toBeGreaterThan(99.9);
  expect(result.off.particles).toBe(0);
  expect(result.cold).toBe(true);
  expect(result.pausedLife).toBe(result.life);
  expect(result.impact).toBe(true);
});

test("zero outdoor light darkens every daylight source and the lamp stays independent", async ({
  page,
}, testInfo) => {
  const errors = watchConsole(page);
  await page.getByRole("tab", { name: "Environment", exact: true }).click();
  await page.getByLabel("Time of day", { exact: true }).fill("12");
  await page.getByLabel("Sunlight intensity", { exact: true }).fill("0.8");
  await page.screenshot({ path: testInfo.outputPath("kitchen-day.png") });
  const day = await page.evaluate(() => {
    const w = (window as any).__world;
    return {
      ambient: w.kitchen.ambient.intensity,
      fill: w.kitchen.fill.intensity,
      color: w.renderer
        .getClearColor(w.kitchen.sky.material.color.clone())
        .getHex(),
    };
  });
  await page.getByLabel("Sunlight intensity", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__world.kitchen.sun.intensity),
    )
    .toBe(0);
  const dark = await page.evaluate(() => {
    const w = (window as any).__world;
    return {
      ambient: w.kitchen.ambient.intensity,
      fill: w.kitchen.fill.intensity,
      sky: w.kitchen.sky.material.emissiveIntensity,
      field: w.kitchen.lightField.visible,
      light: w.lightAt(0, 1, 0),
      color: w.renderer
        .getClearColor(w.kitchen.sky.material.color.clone())
        .getHex(),
    };
  });
  await page.screenshot({
    path: testInfo.outputPath("kitchen-zero-light.png"),
  });
  expect(dark.fill).toBe(0);
  expect(dark.ambient).toBeLessThan(day.ambient * 0.04);
  expect(dark.sky).toBe(0);
  expect(dark.field).toBe(false);
  expect(dark.light).toBeLessThan(0.01);
  expect(dark.color).not.toBe(day.color);
  await page
    .getByRole("switch", { name: "Kitchen light", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__world.kitchen.lamp.intensity),
    )
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(() => (window as any).__world.lightAt(0, 1, 0)),
  ).toBeGreaterThan(0.1);
  await page.screenshot({
    path: testInfo.outputPath("kitchen-zero-light-lamp.png"),
  });
  const textures = await page.evaluate(() => {
    const w = (window as any).__world;
    const materials: any[] = [];
    w.scene.traverse((n: any) => {
      if (n.material)
        materials.push(
          ...(Array.isArray(n.material) ? n.material : [n.material]),
        );
    });
    return materials.filter((m) => m.normalMap?.image && m.roughnessMap?.image)
      .length;
  });
  expect(textures).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});
