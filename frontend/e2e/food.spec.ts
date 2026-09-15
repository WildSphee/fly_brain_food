import { expect, test } from "@playwright/test";
import { inspectWorld, openHabitat, watchConsole } from "./habitat";

test("realistic food preserves textures, serving isolation, and local loading", async ({
  page,
}, testInfo) => {
  const errors = watchConsole(page);
  const modelRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/models/food-")) modelRequests.push(r.url());
  });
  await inspectWorld(page);
  await openHabitat(page);
  await page.getByRole("button", { name: "Pause simulation" }).click();
  await page.evaluate(async () => {
    const w = (window as any).__world;
    w.addFood("cheese", -0.15, 1.25, 0.3);
    await w.syncFoods();
    w.addFood("apple", 0.35, 1.25, -0.1);
    await w.syncFoods();
  });
  const results = await page.evaluate(() => {
    const w = (window as any).__world;
    const meshes = [...w.foodMeshes.values()] as any[];
    const models = meshes.map((group: any) => {
      const parts: any[] = [];
      group.traverse((n: any) => {
        if (n.isMesh)
          parts.push({
            texture: !!n.material.map?.image,
            normal: !!n.material.normalMap?.image,
            vertices: n.geometry.attributes.position.count,
            textureWidth: n.material.map?.image.width,
          });
      });
      return { name: group.name, parts, scale: group.scale.x };
    });
    const apples = meshes.filter((g: any) => g.name === "food-apple");
    const mesh = (g: any) => {
      let m: any;
      g.traverse((n: any) => {
        if (n.isMesh) m = n;
      });
      return m;
    };
    const a = mesh(apples[0]),
      b = mesh(apples[1]);
    const isolated = a.material !== b.material && a.geometry !== b.geometry;
    const fresh = b.material.color.getHex();
    a.material.color.set("#655735");
    const independentTint = b.material.color.getHex() === fresh;
    a.material.color.copy(a.material.userData.freshColor);
    return {
      models,
      isolated,
      independentTint,
      colliders: w.foodColliders.size,
    };
  });
  expect(results.models).toHaveLength(5);
  expect(results.colliders).toBe(5);
  expect(results.isolated && results.independentTint).toBe(true);
  for (const m of results.models) {
    expect(m.scale).toBeGreaterThan(0);
    expect(
      m.parts.every(
        (p: any) => p.texture && p.textureWidth >= 1024 && p.vertices > 100,
      ),
    ).toBe(true);
    if (m.name !== "food-banana")
      expect(m.parts.every((p: any) => p.normal)).toBe(true);
  }
  expect(new Set(modelRequests.map((url) => new URL(url).pathname)).size).toBe(
    4,
  );
  expect(
    modelRequests.every(
      (url) => new URL(url).origin === new URL(page.url()).origin,
    ),
  ).toBe(true);
  // Render a closer view of all four foods on the actual kitchen island.
  await page.evaluate(() => {
    const w = (window as any).__world;
    cancelAnimationFrame(w.raf);
    w.camera.position.set(1.7, 2.5, 2.5);
    w.camera.lookAt(0.15, 1.3, 0.4);
    w.renderer.render(w.scene, w.camera);
  });
  await page.screenshot({ path: testInfo.outputPath("realistic-food.png") });
  expect(errors).toEqual([]);
});
