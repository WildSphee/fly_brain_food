import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { KitchenMaterials, projectUV } from "./materials";
import type { Surface } from "./materials";
import { collideModel } from "./collisions";
import type { MeshCollider } from "./collisions";
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
  materials?: KitchenMaterials,
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
  group.name = name;
  materials?.decorate(group, name);
  return group;
}

export interface Kitchen {
  sun: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
  materials: KitchenMaterials;
  movingColliders: MeshCollider[];
  propColliders: MeshCollider[];
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
  const materials = new KitchenMaterials();
  const movingColliders: MeshCollider[] = [];
  const propColliders: MeshCollider[] = [];
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const surfaceColors: Record<string, [Surface, string]> = {
    "#e5dfce": ["marble", "#ffffff"],
    "#ded3b9": ["marble", "#ffffff"],
    "#e6dfc8": ["marble", "#ffffff"],
    "#d6d2b9": ["plaster", "#dadbd7"],
    "#dbd9c6": ["plaster", "#dadbd7"],
    "#8b9576": ["paint", "#e7e8e2"],
    "#8f987e": ["paint", "#f0f0e9"],
    "#757f61": ["paint", "#e0e2dc"],
    "#7f886b": ["paint", "#edefe9"],
    "#bca582": ["ceramic", "#d8d8d1"],
    "#f4eddb": ["paint", "#e9e9e2"],
    "#cbd0bd": ["ceramic", "#54788a"],
    "#e3e2d1": ["ceramic", "#3c6072"],
    "#b6a579": ["brass", "#bd9c63"],
    "#d2bf87": ["brass", "#bd9c63"],
    "#a78f69": ["wood", "#ffffff"],
    "#b7baa0": ["fabric", "#b6ad98"],
    "#ccc9b4": ["metal", "#d6d9d9"],
    "#cac7b4": ["metal", "#d6d9d9"],
    "#aaa48b": ["metal", "#e2e3df"],
    "#33392e": ["metal", "#606569"],
    "#3d4539": ["metal", "#909797"],
    "#222e27": ["ceramic", "#11191c"],
    "#b7c0c4": ["metal", "#d2dadf"],
  };
  function mat(color: string, roughness = 0.75) {
    const key = color + roughness;
    if (!mats.has(key)) {
      const preset = surfaceColors[color];
      const m = preset
        ? materials.material(...preset)
        : new THREE.MeshStandardMaterial({ color, roughness });
      mats.set(key, m);
    }
    return mats.get(key)!;
  }
  function box(
    pos: number[],
    size: number[],
    color: string,
    collision = true,
    roughness = 0.75,
  ) {
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(
        size[0],
        size[1],
        size[2],
        1,
        Math.min(0.018, Math.min(...size) / 5),
      ),
      mat(color, roughness),
    );
    mesh.position.set(...(pos as [number, number, number]));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    projectUV(mesh);
    if (collision)
      world.createCollider(
        rapier.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2)
          .setTranslation(pos[0], pos[1], pos[2])
          .setFriction(0.65),
      );
    return mesh;
  }
  function cyl(
    pos: number[],
    radius: number,
    height: number,
    color: string,
    collision = true,
  ) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, height, 32),
      mat(color),
    );
    m.position.set(...(pos as [number, number, number]));
    m.castShadow = true;
    scene.add(m);
    projectUV(m);
    if (collision)
      world.createCollider(
        rapier.ColliderDesc.cylinder(height / 2, radius).setTranslation(
          pos[0],
          pos[1],
          pos[2],
        ),
      );
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
  const assets: Promise<unknown>[] = [materials.ready];
  const add = (name: string, pos: number[], width: number, r = 0) => {
    const plant = name.startsWith("plantSmall") || name === "pottedPlant";
    assets.push(
      model(
        scene,
        plant ? "realisticPlant" : name,
        pos,
        width,
        r,
        plant ? undefined : materials,
      ).then((object) => {
        object.name = name;
        propColliders.push(...collideModel(object, world, rapier));
      }),
    );
  };
  // Architectural shell, open visually toward the viewer; collision envelope remains complete.
  box([0, -0.16, 0], [9.4, 0.28, 7.4], "#59604b", true);
  surfaces.push(box([0, -0.01, 0], [9, 0.03, 7], "#bca582", true));
  // Porcelain floor with fine, dark grout like the reference kitchen.
  for (let z = 0; z < 14; z++)
    for (let x = 0; x < 18; x++)
      box(
        [-4.25 + x * 0.5, 0.002, -3.25 + z * 0.5],
        [0.491, 0.022, 0.491],
        "#bca582",
        false,
      );
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
  // Warm white painted cabinetry, inset fronts, brass pulls, marble top.
  // Leave a real opening through the counter and cabinet for the recessed sink.
  box([-2.375, 0.49, -2.92], [4.05, 0.96, 1.12], "#8b9576");
  box([2.755, 0.49, -2.92], [3.29, 0.96, 1.12], "#8b9576");
  box([0.38, 0.4, -2.92], [1.46, 0.78, 1.12], "#8b9576");
  for (const [position, size] of [
    [
      [-2.415, 1.015, -2.87],
      [4.13, 0.1, 1.23],
    ],
    [
      [2.795, 1.015, -2.87],
      [3.37, 0.1, 1.23],
    ],
    [
      [0.38, 1.015, -3.395],
      [1.46, 0.1, 0.18],
    ],
    [
      [0.38, 1.015, -2.38],
      [1.46, 0.1, 0.25],
    ],
  ])
    surfaces.push(box(position, size, "#e5dfce", true, 0.3));
  box([0, 0.1, -2.34], [8.8, 0.14, 0.08], "#525b47");
  for (let i = 0; i < 10; i++) {
    const x = -4 + i * 0.88;
    box([x, 0.56, -2.343], [0.82, 0.73, 0.04], "#8f987e");
    box([x, 0.77, -2.299], [0.25, 0.022, 0.025], "#b6a579", true, 0.3);
  }
  // Backsplash with individual grout joints.
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 22; col++)
      box(
        [-4.35 + col * 0.4 + (row % 2) * 0.2, 1.15 + row * 0.18, -3.458],
        [0.386, 0.169, 0.035],
        (row + col) % 6 === 0 ? "#cbd0bd" : "#e3e2d1",
        true,
        0.28,
      );
  // Window frame and softly colored outdoor vista.
  const sky = box([0.55, 2.16, -3.67], [3, 1.72, 0.04], "#cadfcf", false);
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
  movingColliders.push(...collideModel(windowPane, world, rapier));
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
  const sink = new THREE.Group();
  sink.name = "kitchenSink";
  scene.add(sink);
  const sinkPart = (position: number[], size: number[]) => {
    const mesh = box(position, size, "#b7c0c4", false);
    sink.add(mesh);
    surfaces.push(mesh);
  };
  sinkPart([0.38, 0.835, -2.905], [1.46, 0.035, 0.8]);
  for (const x of [-0.325, 0.38, 1.085])
    sinkPart([x, 0.95, -2.905], [0.05, 0.23, 0.8]);
  for (const z of [-3.28, -2.53]) sinkPart([0.38, 0.95, z], [1.46, 0.23, 0.05]);
  for (const z of [-3.3, -2.51]) sinkPart([0.38, 1.071, z], [1.5, 0.018, 0.07]);
  for (const x of [-0.35, 1.11])
    sinkPart([x, 1.071, -2.905], [0.06, 0.018, 0.8]);
  for (const x of [0.025, 0.735])
    sink.add(cyl([x, 0.858, -2.91], 0.045, 0.008, "#33392e", false));
  const faucet = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.38, 1.075, -3.3),
        new THREE.Vector3(0.38, 1.44, -3.3),
        new THREE.Vector3(0.38, 1.51, -3.14),
        new THREE.Vector3(0.38, 1.39, -2.98),
      ]),
      28,
      0.019,
      10,
      false,
    ),
    mat("#b7c0c4"),
  );
  faucet.castShadow = true;
  faucet.receiveShadow = true;
  sink.add(faucet);
  projectUV(faucet);
  propColliders.push(...collideModel(sink, world, rapier));
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
  const glow = cyl([2.92, 1.14, -3.12], 0.2, 0.01, "#ed6d3e", false);
  (glow.material as THREE.MeshStandardMaterial).emissive.set("#eb5f28");
  // Fridge along left side, table island, stools, rug, and houseplant.
  assets.push(
    model(
      scene,
      "kitchenFridgeLarge",
      [-3.85, 0.03, -0.95],
      1.14,
      Math.PI / 2,
      materials,
    ).then((fridge) => {
      interactive(fridge, "fridge");
      movingColliders.push(...collideModel(fridge, world, rapier));
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
          new THREE.ConeGeometry(0.034, 0.23, 7),
          new THREE.MeshBasicMaterial({
            color: i % 2 ? "#ffba56" : "#70baff",
            transparent: true,
            opacity: 0.85,
          }),
        );
        flame.position.set(
          x + Math.cos((i * Math.PI) / 5) * 0.22,
          1.24,
          z + Math.sin((i * Math.PI) / 5) * 0.22,
        );
        flames.add(flame);
      }
    }
  interactive(flames, "stove");
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
  }
  const rug = box([0.22, 0.024, 2.25], [4.6, 0.02, 1.57], "#b7baa0");
  rug.receiveShadow = true;
  add("pottedPlant", [3.76, 0.025, -0.72], 0.96);
  // Pendant shade with emissive inner disc.
  cyl([0.1, 3.06, 0.5], 0.013, 0.74, "#515846");
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 0.25, 40, 1, true),
    mat("#697355"),
  );
  shade.position.set(0.1, 2.72, 0.5);
  scene.add(shade);
  propColliders.push(...collideModel(shade, world, rapier));
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
  const ambient = new THREE.HemisphereLight("#dfe7ed", "#77736d", 0);
  scene.add(ambient);
  const fill = new THREE.DirectionalLight("#dbe4ee", 0);
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
  field(thermal, [3.25, 1.35, -2.8], 1.8, "#f59958");
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
    fill,
    materials,
    movingColliders,
    propColliders,
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
