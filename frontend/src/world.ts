import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import RAPIER from "@dimforge/rapier3d-compat";
import { buildKitchen, model } from "./kitchen";
import type { Kitchen } from "./kitchen";
import { makeFly } from "./fly";
import { defaultFoods, initialOptions } from "./types";
import type { FoodKind, Motor, Options, Sensors, WorldStats } from "./types";

const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
interface FlyAgent {
  id: number;
  color: string;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  visual: ReturnType<typeof makeFly>;
  yaw: number;
  energy: number;
  hunger: number;
  distance: number;
  landed: boolean;
  behavior: string;
  manualLand: boolean;
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
  get hunger() {
    return this.agent.hunger;
  }
  set hunger(v: number) {
    this.agent.hunger = v;
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
  private get manualLand() {
    return this.agent.manualLand;
  }
  private set manualLand(v: boolean) {
    this.agent.manualLand = v;
  }
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(43, 1, 0.015, 70);
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  private kitchen: Kitchen;
  private marker: THREE.Mesh;
  private foodMeshes = new Map<number, THREE.Group>();
  private raf = 0;
  private previous = performance.now();
  private lastStats = 0;
  private accumulator = 0;
  private keys = new Set<string>();
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
    await RAPIER.init();
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
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
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
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
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
      this.keys.clear();
      if (options.camera === "orbit" || options.camera === "fixed") {
        this.camera.position.set(8.8, 7.2, 10.7);
        this.controls.target.set(0, 1, 0);
        this.camera.fov = 43;
        this.controls.update();
      } else this.camera.fov = options.camera === "eyes" ? 88 : 58;
      this.camera.updateProjectionMatrix();
    }
    if (options.autonomous !== this.options.autonomous) {
      this.keys.clear();
      this.manualLand = false;
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
  private keyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.closest("input,select,textarea,dialog"))
      return;
    if (
      ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyF"].includes(e.code)
    ) {
      e.preventDefault();
      this.keys.add(e.code);
      if (e.code === "KeyF" && !e.repeat) {
        this.manualLand = !this.manualLand;
        this.onEvent(
          this.manualLand ? "Landing requested" : "Takeoff requested",
        );
      }
    }
  };
  private keyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private blur = () => {
    this.keys.clear();
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
    const body = this.physics.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(
          -0.7 + ((id - 1) % 4) * 0.6,
          1.9 + Math.floor((id - 1) / 4) * 0.3,
          1.6 - Math.floor((id - 1) / 4) * 0.6,
        )
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
      yaw: 2.2 + id * 0.65,
      energy: 100,
      hunger: 68,
      distance: 0,
      landed: false,
      behavior: "Exploring",
      manualLand: false,
    });
  }
  selectFly(id: number) {
    if (!this.flies.some((f) => f.id === id)) return;
    this.selectedFly = id;
    this.keys.clear();
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
    this.elapsed = 0;
    this.energy = 100;
    this.hunger = 68;
    this.distance = 0;
    this.yaw = 2.2;
    this.accumulator = 0;
    this.keys.clear();
    this.manualLand = false;
    this.motor = { forward: 0, turn: 0, lift: 0, feeding: 0 };
    this.body.setTranslation({ x: -0.7, y: 1.9, z: 1.6 }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.resetForces(true);
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
        this.scene.remove(obj);
        this.foodMeshes.delete(id);
      }
    }
    for (const f of this.foods)
      if (!this.foodMeshes.has(f.id)) {
        const obj = await model(
          this.scene,
          f.kind,
          [f.x, f.y, f.z],
          f.kind === "banana" ? 0.47 : f.kind === "bread" ? 0.4 : 0.25,
          f.id * 0.8,
        );
        if (
          this.disposed ||
          version !== this.foodVersion ||
          !this.foods.some((v) => v.id === f.id)
        ) {
          this.scene.remove(obj);
          continue;
        }
        obj.userData.foodId = f.id;
        this.foodMeshes.set(f.id, obj);
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
  private odorAt(x: number, y: number, z: number) {
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
      const dz = z - f.z - (this.options.windowOpen ? 0.2 : 0);
      strength +=
        potency *
        f.remaining *
        Math.exp(
          -Math.sqrt((x - f.x) ** 2 + (y - f.y) ** 2 * 2 + dz ** 2) * 1.35,
        );
    }
    return clamp(strength);
  }
  private day() {
    return Math.max(0, Math.sin(((this.options.hour - 6) / 12) * Math.PI));
  }
  private lightAt(x: number, y: number, z: number) {
    const sun = this.day() * this.options.sunlight;
    return clamp(
      0.025 +
        sun *
          (0.18 + 0.75 * Math.exp(-((x - 0.6) ** 2 / 5 + (z + 1) ** 2 / 8))) +
        (this.options.lamp
          ? 0.7 / (1 + (x - 0.1) ** 2 + (y - 2.5) ** 2 + (z - 0.5) ** 2)
          : 0),
    );
  }
  private temperatureAt(x: number, y: number, z: number) {
    const hot = this.options.stove
      ? 22 *
        Math.exp(-((x - 3.25) ** 2 + (y - 1.1) ** 2 + (z + 2.8) ** 2) / 1.2)
      : 0;
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
    const nearby = this.foods.find(
      (f) =>
        Math.hypot(f.x - p.x, f.z - p.z) < 0.26 &&
        Math.abs(p.y - f.y) < 0.19 &&
        f.remaining > 0,
    );
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
    if (this.options.autonomous && !this.connected) return;
    if (this.drag?.fly === this.agent) return;
    const p = this.body.translation(),
      v = this.body.linvel(),
      { temp, nearby } = this.sense();
    let drive = 0,
      turn = 0,
      targetY = p.y,
      feeding = false;
    const autonomous =
      this.options.autonomous || this.agent.id !== this.selectedFly;
    if (autonomous) {
      drive = this.connected ? this.motor.forward : 0;
      turn = this.connected ? this.motor.turn * 2.2 : 0;
      // Explicit engineered flight stabilizer: no target-food coordinates enter steering.
      // A small exploratory saccade is gated by actual descending-neuron activity.
      turn += Math.sin(this.elapsed * 1.1 + this.agent.id) * 0.32 * drive;
      targetY = 1.6 + Math.sin(this.elapsed * 0.55) * 0.4;
      if (
        this.sensors.odor_left + this.sensors.odor_right > 1.0 &&
        this.hunger > 18
      )
        targetY = 1.25;
      feeding = !!nearby && this.motor.feeding > 0.05;
      if (feeding) {
        drive = 0;
        targetY = nearby!.y + 0.022;
      }
    } else {
      drive =
        (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 0.65 : 0);
      turn =
        (this.keys.has("KeyA") ? 1.8 : 0) - (this.keys.has("KeyD") ? 1.8 : 0);
      targetY = clamp(
        p.y +
          (this.keys.has("KeyE") ? 0.45 : 0) -
          (this.keys.has("KeyQ") ? 0.45 : 0),
        0.03,
        3.3,
      );
      feeding = !!nearby && (this.manualLand || p.y < nearby.y + 0.1);
    }
    if (autonomous && drive > 0.01) {
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
      );
      if (hit) {
        turn += 2.6;
        drive *= 0.35;
        targetY = Math.max(targetY, p.y + 0.12);
      }
      if (this.sensors.heat > 0.25 || this.sensors.cold > 0.3)
        turn += 1.8 * drive;
    }
    const canFly =
      this.energy > 1 &&
      (autonomous ? drive > 0.005 && !feeding : !this.manualLand);
    this.yaw += turn * dt;
    const speed = drive * 0.95;
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
      : this.options.autonomous && !this.connected
        ? "Brain offline"
        : this.options.silenced && this.options.autonomous
          ? "Neurons silenced"
          : canFly
            ? "Exploring"
            : this.landed
              ? "Resting"
              : "Landing";
    if (feeding && nearby) {
      nearby.remaining = Math.max(0, nearby.remaining - dt * 0.013);
      this.energy = clamp(this.energy + dt * 3, 0, 100);
      this.hunger = clamp(this.hunger - dt * 5, 0, 100);
      if (nearby.remaining === 0) this.removeFood(nearby.id);
    } else {
      this.energy = clamp(
        this.energy -
          dt * (canFly ? 0.025 : 0.006) -
          Math.max(0, temp - 35) * dt * 0.015,
        0,
        100,
      );
      this.hunger = clamp(this.hunger + dt * 0.035, 0, 100);
    }
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
        if (!this.options.autonomous || this.connected) {
          this.elapsed += 1 / 60;
          if (this.options.cycle)
            this.options.hour = (this.options.hour + 1 / 1800) % 24;
          const previous = this.flies.map((f) => ({ ...f.body.translation() }));
          for (const f of this.flies) {
            this.steppingFly = f;
            this.step(1 / 60);
          }
          this.steppingFly = null;
          this.physics.timestep = 1 / 60;
          this.physics.step();
          this.flies.forEach((f, i) => {
            const p = f.body.translation();
            const bounded = {
              x: clamp(p.x, -4.45, 4.45),
              y: clamp(p.y, 0.03, 3.45),
              z: clamp(p.z, -3.45, 3.45),
            };
            if (p.x !== bounded.x || p.y !== bounded.y || p.z !== bounded.z) {
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
            ? Math.sin(now * 0.095 * this.options.speed) * 0.8
            : 0.15);
      });
    }
    this.marker.position.set(p.x, p.y - 0.02, p.z);
    this.marker.visible =
      this.options.camera === "orbit" || this.options.camera === "fixed";
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
    this.kitchen.sun.intensity = this.day() * this.options.sunlight * 4.2;
    this.kitchen.sun.position.x =
      5 * Math.cos(((this.options.hour - 6) / 12) * Math.PI);
    this.kitchen.ambient.intensity =
      0.15 + this.day() * 1.75 + (this.options.lamp ? 0.38 : 0);
    this.kitchen.lamp.intensity = this.options.lamp ? 10 : 0;
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
      this.options.overlay === "light" && this.day() > 0.05;
    this.kitchen.windowPane.rotation.y = this.options.windowOpen ? -0.55 : 0;
    (this.kitchen.sky.material as THREE.MeshStandardMaterial).color.set(
      this.day() > 0.1 ? "#c2d7c4" : "#202f48",
    );
    this.renderer.setClearColor(
      new THREE.Color("#5d6b68").lerp(new THREE.Color("#c6c9b8"), this.day()),
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
    this.renderer.render(this.scene, this.camera);
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
        hunger: this.hunger,
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
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
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
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.physics.free();
  }
}
