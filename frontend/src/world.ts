import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import RAPIER from "@dimforge/rapier3d-compat";
import { buildKitchen, model } from "./kitchen";
import type { Kitchen } from "./kitchen";
import { makeFly } from "./fly";
import { defaultFoods, initialOptions } from "./types";
import type { FoodKind, Motor, Options, Sensors, WorldStats } from "./types";

const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
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
  energy = 100;
  hunger = 68;
  distance = 0;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(43, 1, 0.015, 70);
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  private body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private kitchen: Kitchen;
  private fly = makeFly();
  private marker: THREE.Mesh;
  private foodMeshes = new Map<number, THREE.Group>();
  private raf = 0;
  private previous = performance.now();
  private lastStats = 0;
  private accumulator = 0;
  private yaw = 2.2;
  private keys = new Set<string>();
  private disposed = false;
  private observer: ResizeObserver;
  private nextFoodId = 4;
  private foodVersion = 0;
  private trailPositions: THREE.Vector3[] = [];
  private trailLine: THREE.Line;
  private lastTrail = 0;
  private fps = 60;
  private landed = false;
  private behavior = "Connecting";
  private manualLand = false;
  private dragStart = { x: 0, y: 0 };
  private onStats: (s: WorldStats) => void;
  private onEvent: (text: string) => void;
  private onPlaced: () => void;

  static async create(
    container: HTMLElement,
    onStats: (s: WorldStats) => void,
    onEvent: (s: string) => void,
    onPlaced: () => void,
  ) {
    await RAPIER.init();
    const engine = new KitchenWorld(container, onStats, onEvent, onPlaced);
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
  ) {
    this.onStats = onStats;
    this.onEvent = onEvent;
    this.onPlaced = onPlaced;
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
      "Interactive 3D kitchen. Drag to orbit, scroll to zoom. Manual flight uses W A S D, E and Q.",
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
    this.body = this.physics.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(-0.7, 1.9, 1.6)
        .setLinearDamping(0.35)
        .setCcdEnabled(true)
        .lockRotations(),
    );
    this.collider = this.physics.createCollider(
      RAPIER.ColliderDesc.ball(0.012)
        .setMass(0.001)
        .setRestitution(0.08)
        .setFriction(0.65),
      this.body,
    );
    this.scene.add(this.fly.group);
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
    this.renderer.domElement.addEventListener("pointerdown", this.pointerDown);
    this.renderer.domElement.addEventListener("pointerup", this.pointerUp);
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
    this.controls.enabled = options.camera === "orbit" && !options.placing;
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
  };
  private pointerDown = (e: PointerEvent) => {
    this.dragStart = { x: e.clientX, y: e.clientY };
  };
  private pointerUp = (e: PointerEvent) => {
    if (
      !this.options.placing ||
      Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) > 5
    )
      return;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
    const hits = ray.intersectObjects(this.kitchen.surfaces);
    const hit = hits.find((h) => h.face && h.face.normal.y > 0.9);
    if (hit) {
      const p = hit.point;
      this.addFood(this.options.placing, p.x, p.y + 0.005, p.z);
      this.onPlaced();
    } else this.onEvent("Click the tabletop, counter, or floor to place food.");
  };

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
    this.elapsed += dt;
    if (this.options.cycle)
      this.options.hour = (this.options.hour + dt / 30) % 24;
    const p = this.body.translation(),
      v = this.body.linvel(),
      { temp, nearby } = this.sense();
    let drive = 0,
      turn = 0,
      targetY = p.y,
      feeding = false;
    if (this.options.autonomous) {
      drive = this.connected ? this.motor.forward : 0;
      turn = this.connected ? this.motor.turn * 2.2 : 0;
      // Explicit engineered flight stabilizer: no target-food coordinates enter steering.
      // A small exploratory saccade is gated by actual descending-neuron activity.
      turn += Math.sin(this.elapsed * 1.1) * 0.32 * drive;
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
    if (this.options.autonomous && drive > 0.01) {
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
      (this.options.autonomous ? drive > 0.005 && !feeding : !this.manualLand);
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
    const prev = new THREE.Vector3(p.x, p.y, p.z);
    this.physics.timestep = dt;
    this.physics.step();
    const after = this.body.translation();
    this.distance += prev.distanceTo(
      new THREE.Vector3(after.x, after.y, after.z),
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
        this.step(1 / 60);
        this.accumulator -= 1 / 60;
      }
    }
    const p = this.body.translation(),
      v = this.body.linvel();
    this.fly.group.position.set(p.x, p.y + 0.045, p.z);
    this.fly.group.rotation.set(
      clamp(v.z * -0.04, -0.15, 0.15),
      this.yaw,
      clamp(-this.motor.turn * 0.25, -0.35, 0.35),
    );
    this.fly.group.visible = this.options.camera !== "eyes";
    this.fly.wings.forEach((w, i) => {
      w.rotation.z =
        (i ? 1 : -1) *
        (this.options.running && !this.landed
          ? Math.sin(now * 0.095) * 0.8
          : 0.15);
    });
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
    if (this.options.camera === "follow") {
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
    } else if (this.options.camera === "orbit") this.controls.update();
    this.renderer.render(this.scene, this.camera);
    if (now - this.lastStats > 200) {
      this.lastStats = now;
      const { temp } = this.sense();
      this.onStats({
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
    );
    this.renderer.domElement.removeEventListener("pointerup", this.pointerUp);
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
