import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type RAPIER from "@dimforge/rapier3d-compat";

const loader = new GLTFLoader();
const cache = new Map<string, THREE.Group>();
export async function loadModel(name: string) {
  if (!cache.has(name)) {
    const gltf = await loader.loadAsync(`/models/${name}.glb`);
    cache.set(name, gltf.scene);
  }
  return cache.get(name)!.clone(true);
}
export async function model(
  scene: THREE.Object3D,
  name: string,
  position: number[],
  width: number,
  rotation = 0,
) {
  const object = await loadModel(name);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const scale = width / Math.max(size.x, size.z);
  const center = box.getCenter(new THREE.Vector3());
  object.position.set(-center.x, -box.min.y, -center.z);
  const group = new THREE.Group();
  group.add(object);
  group.scale.setScalar(scale);
  group.rotation.y = rotation;
  group.position.set(position[0], position[1], position[2]);
  group.traverse((n) => {
    if (n instanceof THREE.Mesh) {
      n.castShadow = true;
      n.receiveShadow = true;
    }
  });
  scene.add(group);
  return group;
}

export interface Kitchen {
  sun: THREE.DirectionalLight;
  ambient: THREE.HemisphereLight;
  lamp: THREE.PointLight;
  glow: THREE.Mesh;
  sky: THREE.Mesh;
  surfaces: THREE.Mesh[];
  thermal: THREE.Group;
  odor: THREE.Group;
  lightField: THREE.Group;
  windowPane: THREE.Mesh;
  interactions: THREE.Object3D[];
  fridgeDoors: THREE.Object3D[];
  flames: THREE.Group;
  pendant: THREE.Mesh;
  assetsReady: Promise<unknown[]>;
}

export function buildKitchen(
  scene: THREE.Scene,
  world: RAPIER.World,
  rapier: typeof RAPIER,
): Kitchen {
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  function mat(color: string, roughness = 0.75, metalness = 0) {
    const key = color + roughness + metalness;
    if (!mats.has(key))
      mats.set(
        key,
        new THREE.MeshStandardMaterial({ color, roughness, metalness }),
      );
    return mats.get(key)!;
  }
  function box(
    pos: number[],
    size: number[],
    color: string,
    collision = false,
    roughness = 0.75,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...(size as [number, number, number])),
      mat(color, roughness),
    );
    mesh.position.set(...(pos as [number, number, number]));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (collision)
      world.createCollider(
        rapier.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2)
          .setTranslation(pos[0], pos[1], pos[2])
          .setFriction(0.65),
      );
    return mesh;
  }
  function cyl(pos: number[], radius: number, height: number, color: string) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, height, 32),
      mat(color),
    );
    m.position.set(...(pos as [number, number, number]));
    m.castShadow = true;
    scene.add(m);
    return m;
  }
  const surfaces: THREE.Mesh[] = [];
  const interactions: THREE.Object3D[] = [];
  const fridgeDoors: THREE.Object3D[] = [];
  const interactive = (object: THREE.Object3D, action: string) => {
    object.userData.action = action;
    interactions.push(object);
    return object;
  };
  const assets: Promise<unknown>[] = [];
  const add = (name: string, pos: number[], width: number, r = 0) => {
    assets.push(model(scene, name, pos, width, r));
  };
  // Architectural shell, open visually toward the viewer; collision envelope remains complete.
  box([0, -0.16, 0], [9.4, 0.28, 7.4], "#59604b", true);
  for (let z = 0; z < 18; z++)
    for (let x = 0; x < 6; x++) {
      const colors = ["#bca582", "#c2ad8d", "#b9a280", "#cbb594", "#bea989"];
      box(
        [-3.74 + x * 1.5, 0.003, -3.3 + z * 0.39],
        [1.49, 0.025, 0.38],
        colors[(x * 3 + z * 7) % 5],
      );
    }
  surfaces.push(box([0, -0.01, 0], [9, 0.03, 7], "#bca582", true));
  box([-4.58, 1.68, 0], [0.16, 3.36, 7.15], "#d6d2b9", true);
  box([0, 0.65, -3.57], [9.2, 1.3, 0.16], "#dbd9c6", true);
  box([0, 3.22, -3.57], [9.2, 0.32, 0.16], "#dbd9c6", true);
  box([-2.85, 2.1, -3.57], [3.5, 1.8, 0.16], "#dbd9c6", true);
  box([3.24, 2.1, -3.57], [2.7, 1.8, 0.16], "#dbd9c6", true);
  for (const [pos, size] of [
    [
      [4.6, 1.75, 0],
      [0.15, 3.5, 7.2],
    ],
    [
      [0, 1.75, 3.6],
      [9.2, 3.5, 0.15],
    ],
    [
      [0, 3.6, 0],
      [9.2, 0.15, 7.2],
    ],
    [
      [0, 1.75, -3.57],
      [9.2, 3.5, 0.15],
    ],
  ] as number[][][])
    world.createCollider(
      rapier.ColliderDesc.cuboid(
        size[0] / 2,
        size[1] / 2,
        size[2] / 2,
      ).setTranslation(pos[0], pos[1], pos[2]),
    );
  // Pale sage painted cabinetry, inset fronts, brass pulls, terrazzo top.
  box([0, 0.49, -2.92], [8.8, 0.96, 1.12], "#8b9576", true);
  surfaces.push(
    box([0, 1.015, -2.87], [8.96, 0.1, 1.23], "#e5dfce", true, 0.3),
  );
  box([0, 0.1, -2.34], [8.8, 0.14, 0.08], "#525b47");
  for (let i = 0; i < 10; i++) {
    const x = -4 + i * 0.88;
    box([x, 0.56, -2.343], [0.82, 0.73, 0.04], "#8f987e");
    box([x, 0.77, -2.299], [0.25, 0.022, 0.025], "#b6a579", false, 0.3);
  }
  // Backsplash with individual grout joints.
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 22; col++)
      box(
        [-4.35 + col * 0.4 + (row % 2) * 0.2, 1.15 + row * 0.18, -3.458],
        [0.386, 0.169, 0.035],
        (row + col) % 6 === 0 ? "#cbd0bd" : "#e3e2d1",
        false,
        0.28,
      );
  // Window frame and softly colored outdoor vista.
  const sky = box([0.55, 2.16, -3.67], [3, 1.72, 0.04], "#cadfcf");
  (sky.material as THREE.MeshStandardMaterial).emissive.set("#a6d4d0");
  (sky.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.35;
  for (const x of [-1.04, 0.54, 2.12])
    box([x, 2.16, -3.42], [0.075, 1.83, 0.16], "#f4eddb");
  for (const y of [1.26, 2.17, 3.07])
    box([0.54, y, -3.42], [3.26, 0.075, 0.18], "#f4eddb");
  box([0.54, 1.25, -3.3], [3.45, 0.09, 0.48], "#e6dfc8", true);
  const windowPane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.65),
    new THREE.MeshPhysicalMaterial({
      color: "#b8dbd6",
      transparent: true,
      opacity: 0.14,
      roughness: 0.1,
      side: THREE.DoubleSide,
    }),
  );
  windowPane.position.set(1.34, 2.18, -3.39);
  scene.add(windowPane);
  interactive(sky, "windowOpen");
  interactive(windowPane, "windowOpen");
  add("plantSmall1", [-0.68, 1.3, -3.22], 0.32);
  add("plantSmall3", [1.84, 1.3, -3.22], 0.4);
  // Decorative shelves and kitchen objects sourced from Kenney's CC0 packs.
  box([-2.72, 2.25, -3.17], [2.3, 0.08, 0.5], "#a78f69", true);
  box([-2.72, 2.85, -3.17], [2.3, 0.08, 0.5], "#a78f69", true);
  for (const x of [-3.58, -1.85])
    box([x, 2.19, -3.24], [0.035, 0.2, 0.32], "#60684f");
  add("bowl", [-3.4, 2.3, -3.16], 0.37);
  add("plate", [-2.86, 2.3, -3.18], 0.4);
  add("mug", [-2.33, 2.3, -3.13], 0.23);
  add("plantSmall2", [-3.4, 2.9, -3.15], 0.38);
  add("books", [-2.53, 2.9, -3.2], 0.55);
  add("kitchenSink", [0.38, 0.77, -2.92], 1.05);
  add("kitchenCoffeeMachine", [-2.55, 1.07, -2.89], 0.55);
  add("mug", [-1.96, 1.07, -2.63], 0.19);
  add("toaster", [-3.51, 1.07, -2.91], 0.45);
  add("knife-block", [1.93, 1.07, -2.94], 0.28);
  add("bottle-oil", [2.23, 1.07, -3.01], 0.2);
  // Stovetop and oven have their own collision volume.
  interactive(
    box([3.25, 1.076, -2.88], [1.45, 0.06, 0.98], "#33392e", true, 0.22),
    "stove",
  );
  for (const x of [2.91, 3.58])
    for (const z of [-3.12, -2.65]) {
      cyl([x, 1.115, z], 0.18, 0.02, "#161b17");
      cyl([x, 1.127, z], 0.12, 0.015, "#4b4c3a");
    }
  add("pot", [2.92, 1.15, -3.1], 0.5);
  add("pan", [3.61, 1.15, -2.65], 0.62, -0.7);
  interactive(box([3.25, 0.53, -2.28], [1.3, 0.64, 0.06], "#3d4539"), "stove");
  box([3.25, 0.48, -2.235], [1.06, 0.4, 0.025], "#222e27");
  box([3.25, 0.77, -2.19], [0.91, 0.04, 0.05], "#aaa48b");
  box([3.26, 2.18, -3.16], [1.65, 0.16, 0.78], "#ccc9b4");
  box([3.26, 2.61, -3.39], [0.72, 0.72, 0.29], "#cac7b4");
  const glow = cyl([2.92, 1.14, -3.12], 0.2, 0.01, "#ed6d3e");
  (glow.material as THREE.MeshStandardMaterial).emissive.set("#eb5f28");
  // Fridge along left side, table island, stools, rug, and houseplant.
  assets.push(
    model(
      scene,
      "kitchenFridgeLarge",
      [-3.85, 0.03, -0.95],
      1.14,
      Math.PI / 2,
    ).then((fridge) => {
      interactive(fridge, "fridge");
      fridge.traverse((n) => {
        if (n.name === "doorLeft" || n.name === "doorRight")
          fridgeDoors.push(n);
      });
    }),
  );
  const flames = new THREE.Group();
  scene.add(flames);
  for (const x of [2.91, 3.58])
    for (const z of [-3.12, -2.65]) {
      for (let i = 0; i < 10; i++) {
        const flame = new THREE.Mesh(
          new THREE.ConeGeometry(0.028, 0.16, 7),
          new THREE.MeshBasicMaterial({
            color: i % 2 ? "#ffba56" : "#70baff",
            transparent: true,
            opacity: 0.85,
          }),
        );
        flame.position.set(
          x + Math.cos((i * Math.PI) / 5) * 0.16,
          1.21,
          z + Math.sin((i * Math.PI) / 5) * 0.16,
        );
        flames.add(flame);
      }
    }
  interactive(flames, "stove");
  box([-3.85, 1.03, -0.95], [1.12, 2.03, 1.12], "#d9d8c8", true).visible =
    false;
  box([0.08, 0.54, 0.62], [3.28, 1.06, 1.44], "#757f61", true);
  surfaces.push(
    box([0.08, 1.18, 0.62], [3.85, 0.14, 1.94], "#ded3b9", true, 0.48),
  );
  box([0.08, 0.15, 1.37], [3.28, 0.12, 0.05], "#414f3d");
  for (const x of [-0.99, 0.08, 1.15]) {
    box([x, 0.63, 1.365], [1.015, 0.76, 0.03], "#7f886b");
    box([x, 0.9, 1.4], [0.35, 0.022, 0.03], "#d2bf87");
  }
  add("cutting-board", [-0.86, 1.26, 0.58], 0.83, 0.2);
  add("plate", [0.5, 1.255, 0.6], 0.54);
  add("cooking-knife", [-0.62, 1.265, 1.07], 0.39, 1.8);
  add("mug", [1.52, 1.26, 1.05], 0.24, 0.3);
  add("bowl", [-1.32, 1.26, 0.06], 0.32);
  for (const x of [-1.0, 0.55, 1.97]) {
    add("stoolBar", [x, 0.02, 2.36], 0.58, Math.PI);
    world.createCollider(
      rapier.ColliderDesc.cuboid(0.24, 0.36, 0.24).setTranslation(
        x,
        0.38,
        2.36,
      ),
    );
  }
  const rug = box([0.22, 0.024, 2.25], [4.6, 0.02, 1.57], "#b7baa0");
  rug.receiveShadow = true;
  for (let x = -2.05; x < 2.5; x += 0.08)
    box([x, 0.037, 2.25], [0.025, 0.006, 1.5], "#9fa789");
  add("pottedPlant", [3.76, 0.025, -0.72], 0.96);
  // Pendant shade with emissive inner disc.
  cyl([0.1, 3.06, 0.5], 0.013, 0.74, "#515846");
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 0.25, 40, 1, true),
    mat("#697355"),
  );
  shade.position.set(0.1, 2.72, 0.5);
  scene.add(shade);
  interactive(shade, "lamp");
  const pendant = cyl([0.1, 2.6, 0.5], 0.3, 0.02, "#fbdfad");
  (pendant.material as THREE.MeshStandardMaterial).emissive.set("#ffdc9a");
  interactive(pendant, "lamp");
  const lamp = new THREE.PointLight("#ffca83", 0, 8, 2);
  lamp.position.set(0.1, 2.55, 0.5);
  scene.add(lamp);
  const sun = new THREE.DirectionalLight("#fff0ce", 3.8);
  sun.position.set(3, 7, -5);
  sun.target.position.set(-1, 0, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -7;
  sun.shadow.camera.right = 7;
  sun.shadow.camera.top = 7;
  sun.shadow.camera.bottom = -7;
  sun.shadow.normalBias = 0.025;
  sun.shadow.bias = -0.0001;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 24;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const ambient = new THREE.HemisphereLight("#f1eee0", "#788369", 2.1);
  scene.add(ambient);
  const fill = new THREE.DirectionalLight("#dbe4d6", 1.4);
  fill.position.set(2, 5, 7);
  scene.add(fill);
  const thermal = new THREE.Group();
  scene.add(thermal);
  function field(
    group: THREE.Group,
    pos: number[],
    radius: number,
    color: string,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 32, 16),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        wireframe: false,
      }),
    );
    mesh.position.set(...(pos as [number, number, number]));
    mesh.scale.y = 0.45;
    group.add(mesh);
  }
  field(thermal, [3.25, 1.25, -2.8], 1.25, "#f59958");
  field(thermal, [-3.25, 0.7, -0.95], 1.4, "#68b6e9");
  thermal.visible = false;
  const odor = new THREE.Group();
  scene.add(odor);
  const lightField = new THREE.Group();
  field(lightField, [0.5, 0.2, -0.5], 2.5, "#ffeb8d");
  lightField.visible = false;
  scene.add(lightField);
  return {
    sun,
    ambient,
    lamp,
    glow,
    sky,
    surfaces,
    thermal,
    odor,
    lightField,
    windowPane,
    interactions,
    fridgeDoors,
    flames,
    pendant,
    assetsReady: Promise.all(assets),
  };
}
