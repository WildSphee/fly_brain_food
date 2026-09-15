import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import RAPIER from "@dimforge/rapier3d-compat";
import { buildKitchen, model } from "./kitchen";
import type { Kitchen } from "./kitchen";
import { MatrixBackdrop } from "./matrix";
import { FlyParticles } from "./particles";
import { moveColliders } from "./collisions";
import { loadFlyModel, makeFly } from "./fly";
import { defaultFoods, initialOptions } from "./types";
import type { FoodKind, Motor, Options, Sensors, WorldStats } from "./types";

const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
// Gameplay thresholds, separate from the connectome's sensory inputs.
const SEEK_HUNGER = 10;
const SATISFIED_HUNGER = 3;
interface FlyAgent {
  id: number;
  color: string;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  visual: ReturnType<typeof makeFly>;
  yaw: number;
  energy: number;
  stomach: number;
  distance: number;
  landed: boolean;
  behavior: string;
  feedingFood: number | null;
  mealTime: number;
  eatParticleTime: number;
  hurtCooldown: number;
  seekingFood: boolean;
  phase: number;
  cruiseHeight: number;
  pace: number;
}
export class KitchenWorld {
  options: Options = { ...initialOptions };
  foods = defaultFoods();
  sensors: Sensors = {
    odor_left: 0,
    odor_right: 0,
    light_left: 0.5,
    light_right: 0.5,
    heat: 0,
    cold: 0,
    taste: 0,
  };
  motor: Motor = { forward: 0, turn: 0, lift: 0, feeding: 0 };
  connected = false;
  renderVisible = true;
  elapsed = 0;
  private flies: FlyAgent[] = [];
  private selectedFly = 1;
  private nextFlyId = 1;
  private steppingFly: FlyAgent | null = null;
  private get agent() {
    return (
      this.steppingFly ?? this.flies.find((f) => f.id === this.selectedFly)!
    );
  }
  private get body() {
    return this.agent.body;
  }
  private get collider() {
    return this.agent.collider;
  }
  get energy() {
    return this.agent.energy;
  }
  set energy(v: number) {
    this.agent.energy = v;
  }
  get stomach() {
    return this.agent.stomach;
  }
  set stomach(v: number) {
    this.agent.stomach = v;
  }
  get distance() {
    return this.agent.distance;
  }
  set distance(v: number) {
    this.agent.distance = v;
  }
  private get yaw() {
    return this.agent.yaw;
  }
  private set yaw(v: number) {
    this.agent.yaw = v;
  }
  private get landed() {
    return this.agent.landed;
  }
  private set landed(v: boolean) {
    this.agent.landed = v;
  }
  private get behavior() {
    return this.agent.behavior;
  }
  private set behavior(v: string) {
    this.agent.behavior = v;
  }
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(43, 1, 0.015, 70);
  private renderer: THREE.WebGLRenderer;
  private environment: THREE.WebGLRenderTarget;
  private controls: OrbitControls;
  private physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  private kitchen: Kitchen;
  private marker: THREE.Mesh;
  private particles: FlyParticles;
  private backdrop = new MatrixBackdrop();
  private foodMeshes = new Map<number, THREE.Group>();
  private foodColliders = new Map<number, RAPIER.Collider>();
  private raf = 0;
  private previous = performance.now();
  private lastStats = 0;
  private accumulator = 0;
  private disposed = false;
  private observer: ResizeObserver;
  private nextFoodId = 4;
  private foodVersion = 0;
  private trailPositions: THREE.Vector3[] = [];
  private trailLine: THREE.Line;
  private lastTrail = 0;
  private fps = 60;
  private drag: {
    fly?: FlyAgent;
    food?: number;
    plane: THREE.Plane;
    offset: THREE.Vector3;
    pointer: number;
  } | null = null;
  private clickedAction: string | null = null;
  private onOptions: (patch: Partial<Options>) => void;
  private dragStart = { x: 0, y: 0 };
  private onStats: (s: WorldStats) => void;
  private onEvent: (text: string) => void;
  private onPlaced: () => void;

  static async create(
    container: HTMLElement,
    onStats: (s: WorldStats) => void,
    onEvent: (s: string) => void,
    onPlaced: () => void,
    onOptions: (patch: Partial<Options>) => void,
  ) {
    await Promise.all([RAPIER.init(), loadFlyModel()]);
    const engine = new KitchenWorld(
      container,
      onStats,
      onEvent,
      onPlaced,
      onOptions,
    );
    try {
      await engine.kitchen.assetsReady;
      await engine.syncFoods();
      return engine;
    } catch (error) {
      engine.dispose();
      throw error;
    }
  }

  private constructor(
    container: HTMLElement,
    onStats: (s: WorldStats) => void,
    onEvent: (s: string) => void,
    onPlaced: () => void,
    onOptions: (patch: Partial<Options>) => void,
  ) {
    this.onStats = onStats;
    this.onEvent = onEvent;
    this.onPlaced = onPlaced;
    this.onOptions = onOptions;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(room, 0.04, 0.1, 100, { size: 128 });
    this.scene.environment = this.environment.texture;
    this.scene.background = this.backdrop.texture;
    this.scene.environmentIntensity = 0;
    room.dispose();
    pmrem.dispose();
    this.renderer.setClearColor("#c6c9b8");
    container.append(this.renderer.domElement);
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D kitchen. Drag flies or food. Click appliances. Drag empty space to orbit, scroll to zoom.",
    );
    this.camera.position.set(8.8, 7.2, 10.7);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 23;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.update();
    this.kitchen = buildKitchen(this.scene, this.physics, RAPIER);
    this.particles = new FlyParticles(this.scene);
    this.addFly();
    this.addFly();
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.13, 0.15, 48),
      new THREE.MeshBasicMaterial({
        color: "#bddf84",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.scene.add(this.marker);
    this.trailLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: "#eef8c8",
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      }),
    );
    this.scene.add(this.trailLine);
    this.observer = new ResizeObserver(() => this.resize(container));
    this.observer.observe(container);
    this.resize(container);
    window.addEventListener("blur", this.blur);
    this.renderer.domElement.addEventListener(
      "pointerdown",
      this.pointerDown,
      true,
    );
    this.renderer.domElement.addEventListener("pointerup", this.pointerUp);
    this.renderer.domElement.addEventListener("pointermove", this.pointerMove);
    this.renderer.domElement.addEventListener("pointercancel", this.cancelDrag);
    this.renderer.domElement.addEventListener(
      "lostpointercapture",
      this.cancelDrag,
    );
    this.raf = requestAnimationFrame(this.frame);
  }

  setOptions(options: Options) {
    if (options.camera !== this.options.camera) {
      if (options.camera === "orbit") {
        this.camera.position.set(8.8, 7.2, 10.7);
        this.controls.target.set(0, 1, 0);
        this.camera.fov = 43;
        this.controls.update();
      } else this.camera.fov = options.camera === "eyes" ? 88 : 58;
      this.camera.updateProjectionMatrix();
    }
    this.options = { ...options };
    this.controls.enabled =
      options.camera === "orbit" && !options.placing && !this.drag;
    this.renderer.domElement.style.cursor = options.placing
      ? "crosshair"
      : options.camera === "orbit"
        ? "grab"
        : "default";
  }
  private resize(container: HTMLElement) {
    const w = container.clientWidth,
      h = container.clientHeight;
    if (w && h) {
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }
  private blur = () => {
    this.cancelDrag();
  };
  private rayAt(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
    return ray;
  }
  private pick(e: PointerEvent) {
    const ray = this.rayAt(e);
    // Enlarged invisible picking volumes keep the tiny flies easy to grab.
    const candidates = this.flies
      .filter((f) => f.visual.group.visible)
      .map((f) => {
        const point = ray.ray.intersectSphere(
          new THREE.Sphere(f.visual.group.position, 0.14),
          new THREE.Vector3(),
        );
        return {
          fly: f,
          distance: point ? point.distanceTo(ray.ray.origin) : Infinity,
        };
      })
      .sort((a, b) => a.distance - b.distance);
    if (candidates[0]?.distance < Infinity) return { fly: candidates[0].fly };
    const hits = ray.intersectObjects(
      [...this.foodMeshes.values(), ...this.kitchen.interactions],
      true,
    );
    if (!hits.length) return null;
    let obj: THREE.Object3D | null = hits[0].object;
    while (obj) {
      if (obj.userData.foodId) return { food: obj.userData.foodId as number };
      if (obj.userData.action) return { action: obj.userData.action as string };
      obj = obj.parent;
    }
    return null;
  }
  private pointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || this.drag) return;
    this.dragStart = { x: e.clientX, y: e.clientY };
    this.clickedAction = null;
    if (this.options.placing) return;
    const hit = this.pick(e);
    if (!hit) return;
    this.controls.enabled = false;
    e.stopImmediatePropagation();
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.clickedAction = hit.action ?? null;
    if (hit.fly || hit.food) {
      if (hit.fly) this.selectFly(hit.fly.id);
      const food = this.foods.find((f) => f.id === hit.food);
      const p = hit.fly ? hit.fly.body.translation() : food!;
      const position = new THREE.Vector3(p.x, p.y, p.z);
      const normal = hit.fly
        ? this.camera.getWorldDirection(new THREE.Vector3())
        : new THREE.Vector3(0, 1, 0);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        normal,
        position,
      );
      const point =
        this.rayAt(e).ray.intersectPlane(plane, new THREE.Vector3()) ??
        position;
      this.drag = {
        fly: hit.fly,
        food: hit.food,
        plane,
        offset: position.clone().sub(point),
        pointer: e.pointerId,
      };
      if (hit.fly) {
        hit.fly.body.setBodyType(
          RAPIER.RigidBodyType.KinematicPositionBased,
          true,
        );
        hit.fly.body.resetForces(true);
        hit.fly.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      this.renderer.domElement.style.cursor = "grabbing";
    }
  };
  private pointerMove = (e: PointerEvent) => {
    if (!this.drag) {
      this.renderer.domElement.style.cursor = this.options.placing
        ? "crosshair"
        : this.pick(e)
          ? "pointer"
          : this.options.camera === "orbit"
            ? "grab"
            : "default";
      return;
    }
    const point = this.rayAt(e).ray.intersectPlane(
      this.drag.plane,
      new THREE.Vector3(),
    );
    if (!point) return;
    point.add(this.drag.offset);
    point.set(
      clamp(point.x, -4.3, 4.3),
      clamp(point.y, 0.12, 3.25),
      clamp(point.z, -3.3, 3.3),
    );
    if (this.drag.fly) {
      const body = this.drag.fly.body;
      const from = body.translation();
      const movement = point
        .clone()
        .sub(new THREE.Vector3(from.x, from.y, from.z));
      const hit = this.physics.castShape(
        from,
        body.rotation(),
        movement,
        this.drag.fly.collider.shape,
        0.002,
        1,
        true,
        undefined,
        undefined,
        this.drag.fly.collider,
        body,
      );
      if (hit)
        point.copy(
          new THREE.Vector3(from.x, from.y, from.z).addScaledVector(
            movement,
            Math.max(0, hit.time_of_impact - 0.005),
          ),
        );
      this.drag.fly.body.setTranslation(point, true);
      this.drag.fly.body.setNextKinematicTranslation(point);
    } else {
      const food = this.foods.find((f) => f.id === this.drag!.food);
      if (!food) return;
      // Snap food to the highest usable horizontal surface below the cursor.
      const down = new THREE.Raycaster(
        new THREE.Vector3(point.x, 4, point.z),
        new THREE.Vector3(0, -1, 0),
      );
      const surface = down
        .intersectObjects(this.kitchen.surfaces)
        .find((h) => h.face && h.face.normal.y > 0.9);
      if (!surface) return;
      food.x = point.x;
      food.y = surface.point.y + 0.005;
      food.z = point.z;
      this.foodMeshes.get(food.id)?.position.set(food.x, food.y, food.z);
      this.updateFoodCollider(food.id);
      const field = this.kitchen.odor.children[this.foods.indexOf(food)];
      field?.position.set(food.x, food.y + 0.2, food.z);
    }
  };
  private cancelDrag = () => {
    if (this.drag?.fly) {
      this.drag.fly.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      this.drag.fly.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    this.drag = null;
    this.clickedAction = null;
    this.controls.enabled =
      this.options.camera === "orbit" && !this.options.placing;
  };
  private pointerUp = (e: PointerEvent) => {
    const moved =
      Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) >
      5;
    const action = this.clickedAction;
    this.cancelDrag();
    if (this.renderer.domElement.hasPointerCapture(e.pointerId))
      this.renderer.domElement.releasePointerCapture(e.pointerId);
    if (moved) return;
    if (action) {
      const key = action as "stove" | "fridge" | "lamp" | "windowOpen";
      this.onOptions({ [key]: !this.options[key] });
    } else if (this.options.placing) {
      const hit = this.rayAt(e)
        .intersectObjects(this.kitchen.surfaces)
        .find((h) => h.face && h.face.normal.y > 0.9);
      if (hit) {
        this.addFood(
          this.options.placing,
          hit.point.x,
          hit.point.y + 0.005,
          hit.point.z,
        );
        this.onPlaced();
      } else this.onEvent("Choose the table, counter, or floor.");
    }
  };

  addFly() {
    if (this.flies.length >= 12) return;
    const id = this.nextFlyId++;
    const color = [
      "#c6eaa0",
      "#77c9ff",
      "#ffa0b5",
      "#ffcf70",
      "#bd9aff",
      "#75e5ce",
      "#ff986b",
      "#eaa5ef",
      "#a1baff",
      "#e3df75",
      "#df9678",
      "#f2f2ed",
    ][(id - 1) % 12];
    const phase = id * 2.399963;
    const start =
      id === 1
        ? { x: -1.6, y: 1.7, z: 1.15, yaw: 2.5, stomach: 76, energy: 92 }
        : id === 2
          ? { x: 2.4, y: 2.3, z: -0.5, yaw: -1.1, stomach: 94, energy: 100 }
          : {
              x: Math.sin(phase) * 2.6,
              y: 1.8 + (id % 3) * 0.3,
              z: Math.cos(phase) * 1.8,
              yaw: phase,
              stomach: 65 + ((id * 13) % 32),
              energy: 88 + ((id * 7) % 13),
            };
    const body = this.physics.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(start.x, start.y, start.z)
        .setLinearDamping(0.35)
        .setCcdEnabled(true)
        .lockRotations(),
    );
    const collider = this.physics.createCollider(
      RAPIER.ColliderDesc.ball(0.012)
        .setMass(0.001)
        .setRestitution(0.08)
        .setFriction(0.65),
      body,
    );
    const visual = makeFly(color);
    this.scene.add(visual.group);
    this.flies.push({
      id,
      color,
      body,
      collider,
      visual,
      yaw: start.yaw,
      energy: start.energy,
      stomach: start.stomach,
      distance: 0,
      landed: false,
      behavior:
        100 - start.stomach >= SEEK_HUNGER ? "Seeking food" : "Exploring",
      feedingFood: null,
      mealTime: 0,
      eatParticleTime: 0,
      hurtCooldown: 0,
      seekingFood: 100 - start.stomach >= SEEK_HUNGER,
      phase,
      cruiseHeight: 1.65 + (id % 3) * 0.25,
      pace: 0.82 + ((id * 7) % 5) * 0.09,
    });
  }
  selectFly(id: number) {
    if (!this.flies.some((f) => f.id === id)) return;
    this.selectedFly = id;
    this.trailPositions = [];
    this.trailLine.geometry.dispose();
    this.trailLine.geometry = new THREE.BufferGeometry();
    (this.marker.material as THREE.MeshBasicMaterial).color.set(
      this.agent.color,
    );
    this.sense();
  }
  captureStream() {
    return this.renderer.domElement.captureStream(30);
  }

  addFood(kind: FoodKind, x?: number, y?: number, z?: number) {
    if (this.foods.length >= 12) {
      this.onEvent(
        "The habitat holds up to 12 food sources. Remove one first.",
      );
      return;
    }
    this.foods.push({
      id: this.nextFoodId++,
      kind,
      x: x ?? -0.9 + (this.foods.length % 4) * 0.6,
      y: y ?? 1.255,
      z: z ?? 0.8,
      remaining: 1,
      freshness: 1,
      meals: 0,
    });
    void this.syncFoods().catch(() =>
      this.onEvent("A food model could not be loaded."),
    );
    this.onEvent(`${kind[0].toUpperCase() + kind.slice(1)} placed in habitat`);
  }
  removeFood(id: number) {
    this.foods = this.foods.filter((f) => f.id !== id);
    void this.syncFoods();
    this.onEvent("Food source removed");
  }
  reset() {
    this.cancelDrag();
    for (const f of this.flies) {
      this.scene.remove(f.visual.group);
      f.visual.group.traverse((n) => {
        if (n instanceof THREE.Mesh || n instanceof THREE.Line) {
          n.geometry.dispose();
          const ms = Array.isArray(n.material) ? n.material : [n.material];
          ms.forEach((m) => m.dispose());
        }
      });
      this.physics.removeRigidBody(f.body);
    }
    this.flies = [];
    this.nextFlyId = 1;
    this.selectedFly = 1;
    this.addFly();
    this.addFly();
    this.elapsed = 0;
    this.particles.clear();
    this.accumulator = 0;
    this.motor = { forward: 0, turn: 0, lift: 0, feeding: 0 };
    this.foodMeshes.forEach((obj) => this.disposeFood(obj));
    this.foodMeshes.clear();
    this.foodColliders.forEach((collider) =>
      this.physics.removeCollider(collider, true),
    );
    this.foodColliders.clear();
    this.foods = defaultFoods();
    this.nextFoodId = 4;
    this.trailPositions = [];
    this.lastTrail = 0;
    void this.syncFoods();
    this.onEvent("Experiment reset · neural seed 42");
  }

  private async syncFoods() {
    const version = ++this.foodVersion;
    for (const [id, obj] of this.foodMeshes) {
      if (!this.foods.some((f) => f.id === id)) {
        this.disposeFood(obj);
        this.foodMeshes.delete(id);
        const collider = this.foodColliders.get(id);
        if (collider) this.physics.removeCollider(collider, true);
        this.foodColliders.delete(id);
      }
    }
    for (const f of this.foods)
      if (!this.foodMeshes.has(f.id)) {
        const obj = await model(
          this.scene,
          `food-${f.kind}`,
          [f.x, f.y, f.z],
          f.kind === "banana" ? 0.47 : f.kind === "bread" ? 0.4 : 0.25,
          f.id * 0.8,
          this.kitchen.materials,
        );
        if (
          this.disposed ||
          version !== this.foodVersion ||
          !this.foods.some((v) => v.id === f.id)
        ) {
          this.disposeFood(obj);
          continue;
        }
        obj.userData.foodId = f.id;
        obj.userData.baseScale = obj.scale.x;
        obj.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            const materials = Array.isArray(node.material)
              ? node.material
              : [node.material];
            materials.forEach((m) => {
              m.userData.freshColor = m.color.clone();
            });
          }
        });
        this.foodMeshes.set(f.id, obj);
        this.updateFoodCollider(f.id);
      }
    this.kitchen.odor.children.forEach((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
    this.kitchen.odor.clear();
    for (const f of this.foods) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 24, 12),
        new THREE.MeshBasicMaterial({
          color: "#d5eb83",
          transparent: true,
          opacity: 0.1,
          depthWrite: false,
          wireframe: true,
        }),
      );
      mesh.position.set(f.x, f.y + 0.2, f.z);
      mesh.scale.set(1.2, 0.6, 1.2);
      this.kitchen.odor.add(mesh);
    }
  }
  private odorAt(x: number, y: number, z: number, bounded = true) {
    let strength = 0;
    for (const f of this.foods) {
      const potency =
        f.kind === "banana"
          ? 1
          : f.kind === "cheese"
            ? 0.85
            : f.kind === "apple"
              ? 0.65
              : 0.4;
      if (f.remaining <= 0.08) continue;
      const dz = z - f.z - (this.options.windowOpen ? 0.2 : 0);
      strength +=
        potency *
        f.remaining *
        Math.exp(
          -Math.sqrt((x - f.x) ** 2 + (y - f.y) ** 2 * 2 + dz ** 2) * 1.35,
        );
    }
    return bounded ? clamp(strength) : strength;
  }
  private day() {
    return Math.max(0, Math.sin(((this.options.hour - 6) / 12) * Math.PI));
  }
  private lightAt(x: number, y: number, z: number) {
    const sun = this.day() * this.options.sunlight;
    return clamp(
      0.002 +
        sun *
          (0.18 + 0.75 * Math.exp(-((x - 0.6) ** 2 / 5 + (z + 1) ** 2 / 8))) +
        (this.options.lamp
          ? 0.7 / (1 + (x - 0.1) ** 2 + (y - 2.5) ** 2 + (z - 0.5) ** 2)
          : 0),
    );
  }
  private temperatureAt(x: number, y: number, z: number) {
    const hot = this.options.stove ? 34 * this.stoveExposure(x, y, z) : 0;
    const cold = this.options.fridge
      ? -10 *
        Math.exp(-((x + 3.6) ** 2 + (y - 0.7) ** 2 + (z + 0.95) ** 2) / 1.3)
      : 0;
    return (
      this.options.temperature +
      hot +
      cold +
      this.day() *
        this.options.sunlight *
        2 *
        Math.exp(-((x - 0.6) ** 2 + (z + 1.5) ** 2) / 4)
    );
  }
  private sense() {
    const p = this.body.translation(),
      dx = Math.cos(this.yaw) * 0.085,
      dz = -Math.sin(this.yaw) * 0.085;
    const temp = this.temperatureAt(p.x, p.y, p.z);
    const nearby = this.foods.find((f) => {
      if (f.remaining <= 0.08) return false;
      const contact = this.foodColliders.get(f.id)?.projectPoint(p, true)?.point;
      return (
        (contact &&
          Math.hypot(contact.x - p.x, contact.y - p.y, contact.z - p.z) <
            0.06) ||
        (Math.hypot(f.x - p.x, f.z - p.z) < 0.26 &&
          p.y >= f.y - 0.04 &&
          p.y <= f.y + 0.32)
      );
    });
    this.sensors = {
      odor_left: this.odorAt(p.x - dx, p.y, p.z - dz),
      odor_right: this.odorAt(p.x + dx, p.y, p.z + dz),
      light_left: this.lightAt(p.x - dx, p.y, p.z - dz),
      light_right: this.lightAt(p.x + dx, p.y, p.z + dz),
      heat: clamp((temp - 28) / 15),
      cold: clamp((20 - temp) / 12),
      taste: nearby ? 1 : 0,
    };
    return { temp, nearby };
  }

  private step(dt: number) {
    if (!this.connected) return;
    if (this.drag?.fly === this.agent) {
      this.finishMeal(this.agent);
      return;
    }
    const p = this.body.translation(),
      v = this.body.linvel(),
      { temp, nearby } = this.sense();
    let drive = 0,
      turn = 0,
      targetY = p.y,
      feeding = false;
    const hunger = 100 - this.stomach;
    if (hunger >= SEEK_HUNGER) this.agent.seekingFood = true;
    else if (hunger <= SATISFIED_HUNGER) this.agent.seekingFood = false;
    const canEat =
      this.stomach <
      (this.agent.feedingFood === nearby?.id ? 99 : 100 - SEEK_HUNGER);
    drive = this.options.silenced ? 0 : this.motor.forward;
    turn = this.motor.turn * 2.2;
    // The actual descending readout drives each fly's engineered stabilizer.
    turn +=
      Math.sin(
        this.elapsed * (0.7 + this.agent.pace * 0.4) + this.agent.phase,
      ) *
      0.5 *
      drive;
    targetY =
      this.agent.cruiseHeight +
      Math.sin(this.elapsed * 0.55 * this.agent.pace + this.agent.phase) * 0.3;
    if (this.agent.seekingFood && drive > 0.01) {
      // Engineered local plume following, not a claim of neural olfactory navigation.
      // Unsaturated samples preserve the gradient close to overlapping food plumes.
      const sample = 0.16;
      const gx =
        this.odorAt(p.x + sample, p.y, p.z, false) -
        this.odorAt(p.x - sample, p.y, p.z, false);
      const gz =
        this.odorAt(p.x, p.y, p.z + sample, false) -
        this.odorAt(p.x, p.y, p.z - sample, false);
      // Approach above the plume's surface origin to clear boards and plate rims.
      const approachY = p.y - 0.22;
      const gy =
        this.odorAt(p.x, approachY + sample, p.z, false) -
        this.odorAt(p.x, approachY - sample, p.z, false);
      const gradient = Math.hypot(gx, gz, gy);
      if (gradient > 0.0001) {
        const heading = Math.atan2(gx, gz) - this.yaw;
        const error = Math.atan2(Math.sin(heading), Math.cos(heading));
        turn = clamp(error * 3, -2.8, 2.8) + this.motor.turn * 0.12;
        drive *= clamp(Math.cos(error), 0.18, 1);
        targetY = clamp(p.y + (gy / gradient) * 0.45, 0.04, 3.1);
      }
    }
    // Each fly's own taste contact can initiate a meal while neural drive is active.
    // The shared brain may be tasting nothing at the selected fly's position.
    feeding =
      !!nearby &&
      canEat &&
      !this.options.silenced &&
      (this.motor.feeding > 0.05 || this.motor.forward > 0.01);
    if (feeding) {
      drive = 0;
      targetY = nearby!.y + 0.022;
    }
    if (drive > 0.01) {
      // Avoid imminent physical collisions using a short range feeler, independently of the brain.
      const ray = new RAPIER.Ray(
        { x: p.x, y: p.y, z: p.z },
        { x: Math.sin(this.yaw), y: 0, z: Math.cos(this.yaw) },
      );
      const hit = this.physics.castRay(
        ray,
        0.6,
        true,
        undefined,
        undefined,
        this.collider,
        undefined,
        (collider) =>
          !this.agent.seekingFood ||
          ![...this.foodColliders.values()].some(
            (food) => food.handle === collider.handle,
          ),
      );
      if (hit) {
        turn += 2.6;
        drive *= 0.35;
        targetY = Math.max(targetY, p.y + 0.12);
      }
      if (this.sensors.heat > 0.25 || this.sensors.cold > 0.3)
        turn += 1.8 * drive;
    }
    const canFly = this.energy > 1 && drive > 0.005 && !feeding;
    this.yaw += turn * dt;
    const speed = drive * 0.95 * this.agent.pace;
    const m = this.body.mass();
    this.body.resetForces(true);
    this.body.addForce(
      {
        x: m * (Math.sin(this.yaw) * speed - v.x) * 8,
        y: canFly
          ? m * (9.81 + clamp((targetY - p.y) * 12 - v.y * 5, -16, 16))
          : 0,
        z: m * (Math.cos(this.yaw) * speed - v.z) * 8,
      },
      true,
    );
    this.landed = Math.abs(this.body.linvel().y) < 0.04 && !canFly;
    this.behavior = feeding
      ? "Feeding"
      : !this.connected
        ? "Brain offline"
        : this.options.silenced
          ? "Neurons silenced"
          : canFly
            ? this.agent.seekingFood
              ? "Seeking food"
              : "Exploring"
            : this.landed
              ? "Resting"
              : "Landing";
    this.agent.hurtCooldown = Math.max(0, this.agent.hurtCooldown - dt);
    if (feeding && nearby) {
      if (this.agent.feedingFood !== nearby.id) {
        this.finishMeal(this.agent);
        this.agent.feedingFood = nearby.id;
      }
      this.agent.mealTime += dt;
      this.energy = clamp(this.energy + dt * 3, 0, 100);
      this.stomach = clamp(this.stomach + dt * 5, 0, 100);
      this.agent.eatParticleTime -= dt;
      if (this.agent.eatParticleTime <= 0) {
        this.particles.emit("eating", p, this.yaw);
        this.agent.eatParticleTime = 0.16;
      }
    } else {
      this.finishMeal(this.agent);
      this.energy = clamp(this.energy - dt * (canFly ? 0.025 : 0.006), 0, 100);
      this.stomach = clamp(this.stomach - dt * (canFly ? 0.12 : 0.06), 0, 100);
    }
    // All actual harm goes through one path, including heat while eating.
    const heatDamage = Math.max(0, temp - 35) * 0.09;
    const coldDamage = Math.max(0, 12 - temp) * 0.06;
    const starvation = this.stomach <= 0 ? 0.12 : 0;
    this.hurt(this.agent, (heatDamage + coldDamage + starvation) * dt);
  }

  private stoveExposure(x: number, y: number, z: number) {
    return Math.exp(
      -((x - 3.25) ** 2 + ((y - 1.35) * 1.3) ** 2 + (z + 2.8) ** 2) / 2.2,
    );
  }
  private hurt(fly: FlyAgent, amount: number) {
    if (amount <= 0 || fly.energy <= 0) return;
    fly.energy = clamp(fly.energy - amount, 0, 100);
    fly.behavior = "Hurt";
    if (fly.hurtCooldown <= 0) {
      this.particles.emit("hurt", fly.body.translation());
      fly.hurtCooldown = 0.3;
    }
  }
  private finishMeal(fly: FlyAgent) {
    if (fly.feedingFood !== null && fly.mealTime >= 0.5) {
      const food = this.foods.find((f) => f.id === fly.feedingFood);
      if (food) {
        food.meals++;
        food.freshness = Math.max(0, food.freshness - 0.06);
      }
    }
    fly.feedingFood = null;
    fly.mealTime = 0;
  }
  private ageFoods(dt: number) {
    for (const food of this.foods) {
      if (food.meals === 0) continue;
      const feeding = this.flies.some((fly) => fly.feedingFood === food.id);
      // Each completed meal accelerates spoilage; food lasts minutes after eating.
      food.freshness = Math.max(
        0,
        food.freshness - dt * (0.0015 + Math.min(food.meals, 8) * 0.0005),
      );
      if (!feeding)
        food.remaining = Math.max(
          0,
          food.remaining - dt * (0.0005 + (1 - food.freshness) * 0.003),
        );
      const mesh = this.foodMeshes.get(food.id);
      if (mesh) {
        mesh.scale.setScalar(
          mesh.userData.baseScale * Math.cbrt(food.remaining),
        );
        this.updateFoodCollider(food.id);
        mesh.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          const materials = Array.isArray(node.material)
            ? node.material
            : [node.material];
          materials.forEach((m) => {
            m.color
              .copy(m.userData.freshColor)
              .lerp(new THREE.Color("#655735"), (1 - food.freshness) * 0.8);
            m.roughness = 0.45 + (1 - food.freshness) * 0.5;
          });
        });
      }
    }
    const decayed = this.foods.filter((food) => food.remaining <= 0);
    if (decayed.length) {
      this.foods = this.foods.filter((food) => food.remaining > 0);
      void this.syncFoods();
      this.onEvent("Decayed food returned to the compost");
    }
  }
  private updateFoodCollider(id: number) {
    const object = this.foodMeshes.get(id);
    if (!object) return;
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    half.max(new THREE.Vector3(0.001, 0.001, 0.001));
    const collider = this.foodColliders.get(id);
    if (collider) {
      collider.setHalfExtents(half);
      collider.setTranslation(center);
    } else
      this.foodColliders.set(
        id,
        this.physics.createCollider(
          RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
            .setTranslation(center.x, center.y, center.z)
            .setFriction(0.65),
        ),
      );
  }
  private disposeFood(object: THREE.Group) {
    object.removeFromParent();
    object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.geometry.dispose();
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];
      materials.forEach((material) => material.dispose());
    });
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    const delta = Math.min((now - this.previous) / 1000, 0.1);
    this.previous = now;
    this.fps = this.fps * 0.95 + (1 / Math.max(delta, 0.001)) * 0.05;
    if (this.options.running) {
      this.accumulator += delta * this.options.speed;
      let steps = 0;
      while (this.accumulator >= 1 / 60 && steps++ < 12) {
        if (this.connected) {
          this.elapsed += 1 / 60;
          if (this.options.cycle)
            this.options.hour = (this.options.hour + 1 / 1800) % 24;
          const previous = this.flies.map((f) => ({ ...f.body.translation() }));
          const velocities = this.flies.map((f) => ({ ...f.body.linvel() }));
          for (const f of this.flies) {
            this.steppingFly = f;
            this.step(1 / 60);
          }
          this.steppingFly = null;
          this.physics.timestep = 1 / 60;
          this.physics.step();
          this.ageFoods(1 / 60);
          this.particles.step(1 / 60);
          this.flies.forEach((f, i) => {
            const p = f.body.translation();
            const before = velocities[i],
              after = f.body.linvel();
            const impact = Math.hypot(
              before.x - after.x,
              before.y - after.y,
              before.z - after.z,
            );
            if (impact > 0.7 && f.hurtCooldown <= 0 && this.drag?.fly !== f) {
              let touching = false;
              this.physics.contactPairsWith(f.collider, () => {
                touching = true;
              });
              if (touching) this.hurt(f, (impact - 0.6) * 1.5);
            }
            const bounded = {
              x: clamp(p.x, -4.45, 4.45),
              y: clamp(p.y, 0.012, 3.45),
              z: clamp(p.z, -3.45, 3.45),
            };
            if (p.x !== bounded.x || p.y !== bounded.y || p.z !== bounded.z) {
              const boundaryImpact = Math.hypot(
                p.x !== bounded.x ? after.x : 0,
                p.y !== bounded.y ? after.y : 0,
                p.z !== bounded.z ? after.z : 0,
              );
              if (boundaryImpact > 0.7 && f.hurtCooldown <= 0)
                this.hurt(f, (boundaryImpact - 0.6) * 1.5);
              f.body.setTranslation(bounded, true);
              f.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
            }
            f.distance += Math.hypot(
              bounded.x - previous[i].x,
              bounded.y - previous[i].y,
              bounded.z - previous[i].z,
            );
          });
          this.sense();
        }
        this.accumulator -= 1 / 60;
      }
    }
    const p = this.body.translation(),
      v = this.body.linvel();
    for (const f of this.flies) {
      const p = f.body.translation(),
        v = f.body.linvel();
      f.visual.group.position.set(p.x, p.y + 0.045, p.z);
      f.visual.group.rotation.set(
        clamp(v.z * -0.04, -0.15, 0.15),
        f.yaw,
        clamp(-this.motor.turn * 0.25, -0.35, 0.35),
      );
      f.visual.group.visible =
        this.options.camera !== "eyes" || f.id !== this.selectedFly;
      f.visual.wings.forEach((w, i) => {
        w.rotation.z =
          (i ? 1 : -1) *
          (this.options.running && !f.landed
            ? Math.sin(this.elapsed * 95 * f.pace + f.phase) * 0.8
            : 0.15);
      });
    }
    this.marker.position.set(p.x, p.y - 0.02, p.z);
    this.marker.visible = this.options.camera === "orbit";
    if (this.options.running && this.elapsed - this.lastTrail > 0.15) {
      this.lastTrail = this.elapsed;
      this.trailPositions.push(new THREE.Vector3(p.x, p.y, p.z));
      if (this.trailPositions.length > 240) this.trailPositions.shift();
      this.trailLine.geometry.dispose();
      this.trailLine.geometry = new THREE.BufferGeometry().setFromPoints(
        this.trailPositions,
      );
    }
    this.trailLine.visible =
      this.options.trail && this.options.camera !== "eyes";
    const daylight = this.day() * this.options.sunlight;
    this.backdrop.update(this.elapsed, daylight);
    this.scene.environmentIntensity =
      daylight * 0.28 + (this.options.lamp ? 0.08 : 0);
    this.kitchen.sun.intensity = daylight * 2.8;
    this.kitchen.fill.intensity = daylight * 0.45;
    this.kitchen.sun.position.x =
      5 * Math.cos(((this.options.hour - 6) / 12) * Math.PI);
    this.kitchen.ambient.intensity =
      0.018 + daylight * 0.95 + (this.options.lamp ? 0.1 : 0);
    this.kitchen.lamp.intensity = this.options.lamp ? 7 : 0;
    this.kitchen.glow.visible = this.options.stove;
    this.kitchen.flames.visible = this.options.stove;
    this.kitchen.flames.children.forEach((flame, i) => {
      flame.scale.y = 0.8 + Math.sin(this.elapsed * 12 + i) * 0.25;
    });
    this.kitchen.fridgeDoors.forEach((door) => {
      door.rotation.y = THREE.MathUtils.damp(
        door.rotation.y,
        this.options.fridge ? (door.name === "doorLeft" ? -1.6 : 1.6) : 0,
        10,
        delta,
      );
    });
    (
      this.kitchen.pendant.material as THREE.MeshStandardMaterial
    ).emissiveIntensity = this.options.lamp ? 2 : 0;

    this.kitchen.thermal.visible = this.options.overlay === "thermal";
    this.kitchen.thermal.children[0].visible = this.options.stove;
    this.kitchen.thermal.children[1].visible = this.options.fridge;
    this.kitchen.odor.visible = this.options.overlay === "odor";
    this.kitchen.lightField.visible =
      this.options.overlay === "light" &&
      (daylight > 0.02 || this.options.lamp);
    this.kitchen.windowPane.rotation.y = this.options.windowOpen ? -0.55 : 0;
    moveColliders(this.kitchen.movingColliders);
    const skyMaterial = this.kitchen.sky.material as THREE.MeshStandardMaterial;
    skyMaterial.color.set("#080d16").lerp(new THREE.Color("#a6bfcc"), daylight);
    skyMaterial.emissive.set("#b8ccd9");
    skyMaterial.emissiveIntensity = daylight * 0.35;
    this.renderer.setClearColor(
      new THREE.Color("#06090f").lerp(new THREE.Color("#929da3"), daylight),
    );
    if (this.options.camera === "follow" && !this.drag) {
      const wanted = new THREE.Vector3(
        p.x - Math.sin(this.yaw) * 0.68,
        p.y + 0.33,
        p.z - Math.cos(this.yaw) * 0.68,
      );
      this.camera.position.lerp(wanted, 1 - Math.exp(-delta * 7));
      this.camera.lookAt(p.x, p.y + 0.06, p.z);
    } else if (this.options.camera === "eyes") {
      this.camera.position.set(
        p.x + Math.sin(this.yaw) * 0.018,
        p.y + 0.025,
        p.z + Math.cos(this.yaw) * 0.018,
      );
      this.camera.lookAt(
        p.x + Math.sin(this.yaw),
        p.y + 0.01,
        p.z + Math.cos(this.yaw),
      );
    } else if (this.options.camera === "orbit" && !this.drag)
      this.controls.update();
    if (this.renderVisible) this.renderer.render(this.scene, this.camera);
    if (now - this.lastStats > 200) {
      this.lastStats = now;
      const { temp } = this.sense();
      this.onStats({
        flies: this.flies.map((f) => ({
          id: f.id,
          color: f.color,
          ...f.body.translation(),
        })),
        selectedFly: this.selectedFly,
        elapsed: this.elapsed,
        speed: Math.hypot(v.x, v.y, v.z),
        altitude: p.y,
        energy: this.energy,
        stomach: this.stomach,
        temperature: temp,
        light: (this.sensors.light_left + this.sensors.light_right) / 2,
        odor: (this.sensors.odor_left + this.sensors.odor_right) / 2,
        behavior: this.options.running ? this.behavior : "Paused",
        x: p.x,
        z: p.z,
        fps: Math.round(this.fps),
        distance: this.distance,
        foods: this.foods.map((f) => ({ ...f })),
        hour: this.options.hour,
      });
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.controls.dispose();
    window.removeEventListener("blur", this.blur);
    this.renderer.domElement.removeEventListener(
      "pointerdown",
      this.pointerDown,
      true,
    );
    this.renderer.domElement.removeEventListener("pointerup", this.pointerUp);
    this.renderer.domElement.removeEventListener(
      "pointermove",
      this.pointerMove,
    );
    this.renderer.domElement.removeEventListener(
      "pointercancel",
      this.cancelDrag,
    );
    this.renderer.domElement.removeEventListener(
      "lostpointercapture",
      this.cancelDrag,
    );
    this.scene.traverse((n) => {
      if (n instanceof THREE.Mesh || n instanceof THREE.Line) {
        n.geometry.dispose();
        const materials = Array.isArray(n.material) ? n.material : [n.material];
        materials.forEach((m) => m.dispose());
      }
    });
    this.particles.dispose();
    this.kitchen.materials.dispose();
    this.environment.dispose();
    this.backdrop.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.physics.free();
  }
}
