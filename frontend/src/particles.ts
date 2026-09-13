import * as THREE from "three";

type Effect = "eating" | "hurt";
interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  duration: number;
  color: THREE.Color;
  kind: Effect;
}

// Bounded pool shared by all flies, stepped with simulation time (including pause/speed).
export class FlyParticles {
  private particles: Particle[] = [];
  private readonly capacity = 360;
  private positions = new Float32Array(this.capacity * 3);
  private colors = new Float32Array(this.capacity * 3);
  readonly mesh: THREE.Points;
  constructor(scene: THREE.Scene) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(this.colors, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    geometry.setDrawRange(0, 0);
    const material = new THREE.PointsMaterial({
      size: 0.045,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\nif (distance(gl_PointCoord, vec2(0.5)) > 0.5) discard;",
      );
    };
    this.mesh = new THREE.Points(geometry, material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  emit(kind: Effect, p: { x: number; y: number; z: number }, yaw = 0) {
    for (let i = 0; i < (kind === "hurt" ? 12 : 4); i++) {
      if (this.particles.length >= this.capacity) this.particles.shift();
      const angle = Math.random() * Math.PI * 2;
      const speed = kind === "hurt" ? 0.3 : 0.12;
      const duration = kind === "hurt" ? 0.65 : 0.8;
      this.particles.push({
        position: new THREE.Vector3(
          p.x + (kind === "eating" ? Math.sin(yaw) * 0.07 : 0),
          p.y + 0.05,
          p.z + (kind === "eating" ? Math.cos(yaw) * 0.07 : 0),
        ),
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed,
          0.12 + Math.random() * 0.2,
          Math.sin(angle) * speed,
        ),
        life: duration,
        duration,
        kind,
        color: new THREE.Color(
          kind === "hurt"
            ? i % 2
              ? "#ff6043"
              : "#ffb66d"
            : i % 2
              ? "#d5e98a"
              : "#e6bc73",
        ),
      });
    }
  }
  step(dt: number) {
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0);
    this.particles.forEach((p, i) => {
      p.position.addScaledVector(p.velocity, dt);
      p.velocity.y -= dt * 0.28;
      p.position.toArray(this.positions, i * 3);
      p.color
        .clone()
        .multiplyScalar(p.life / p.duration)
        .toArray(this.colors, i * 3);
    });
    this.mesh.geometry.setDrawRange(0, this.particles.length);
    this.mesh.geometry.getAttribute("position").needsUpdate = true;
    this.mesh.geometry.getAttribute("color").needsUpdate = true;
  }
  clear() {
    this.particles = [];
    this.mesh.geometry.setDrawRange(0, 0);
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
