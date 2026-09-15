import * as THREE from "three";

// An illustrative wall fire, kept separate from stove controls and room physics.
export class PanicFire {
  readonly group = new THREE.Group();
  readonly lights: THREE.PointLight[] = [];
  readonly material: THREE.ShaderMaterial;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  constructor(scene: THREE.Scene) {
    this.group.name = "panic-wall-fire";
    this.group.visible = false;
    this.material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      vertexShader: `
        attribute float flameSeed;
        varying vec2 flameUV;
        varying float seed;
        void main() {
          flameUV = uv;
          seed = flameSeed;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        varying vec2 flameUV;
        varying float seed;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                     mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        void main() {
          vec2 uv = flameUV;
          float t = time * 1.8 + seed * 17.0;
          float swirl = noise(vec2(uv.x * 5.0 + seed, uv.y * 4.0 - t));
          float detail = noise(vec2(uv.x * 11.0, uv.y * 9.0 - t * 2.0));
          float sway = sin(uv.y * 9.0 - t * 2.0) * uv.y * 0.11;
          float edge = abs(uv.x - 0.5 + sway) * 2.0;
          float body = 1.0 - edge - uv.y * 0.8 + (swirl - 0.5) * 0.65;
          float alpha = smoothstep(0.02, 0.26, body) * (1.0 - smoothstep(0.65, 1.0, uv.y));
          alpha *= smoothstep(0.0, 0.08, uv.y) * (0.55 + detail * 0.4);
          float core = clamp(body * (1.0 - uv.y) * 1.7, 0.0, 1.0);
          vec3 color = mix(vec3(1.0, 0.07, 0.005), vec3(1.0, 0.78, 0.12), core);
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
    const placements: {
      x: number;
      z: number;
      rotation: number;
      base: number;
    }[] = [];
    // The kitchen is a cutaway: flames follow its two visible walls, leaving
    // the open front/right viewing sides clear for clicking and dragging.
    for (const base of [0.12, 1.22]) {
      for (let x = -4.2; x < 4.5; x += 0.48)
        placements.push({ x, z: -3.43, rotation: 0, base });
      for (let z = -3.15; z < 3.4; z += 0.48)
        placements.push({ x: -4.44, z, rotation: Math.PI / 2, base });
    }
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.setAttribute(
      "flameSeed",
      new THREE.InstancedBufferAttribute(
        new Float32Array(placements.map((_, i) => i * 0.731)),
        1,
      ),
    );
    const flames = new THREE.InstancedMesh(
      geometry,
      this.material,
      placements.length,
    );
    const transform = new THREE.Object3D();
    placements.forEach((p, i) => {
      const height = 1.7 + (Math.sin(i * 9.1) + 1) * 0.28;
      transform.position.set(p.x, p.base + height / 2, p.z);
      transform.rotation.y = p.rotation;
      transform.scale.set(0.78, height, 1);
      transform.updateMatrix();
      flames.setMatrixAt(i, transform.matrix);
    });
    flames.frustumCulled = false;
    this.group.add(flames);
    for (const p of [
      [-3.95, 1.9, 1.8],
      [-3.95, 1.9, -2],
      [-0.5, 2, -3.1],
      [3.2, 1.8, -3.1],
    ]) {
      const light = new THREE.PointLight("#ff6820", 0, 11, 2);
      light.position.set(p[0], p[1], p[2]);
      this.lights.push(light);
      // Keep lights registered even when off to avoid shader recompilation.
      scene.add(light);
    }
    scene.add(this.group);
  }

  update(active: boolean, elapsed: number) {
    const time = this.reducedMotion.matches ? 0 : elapsed;
    this.group.visible = active;
    this.material.uniforms.time.value = time;
    this.lights.forEach((light, i) => {
      light.intensity = active ? 22 + Math.sin(time * 9 + i * 2) * 2.5 : 0;
    });
  }
}

// Analytic heat/light exposure from the same two burning wall planes.
export function wallFireExposure(x: number, z: number) {
  const distance = Math.max(0, Math.min(x + 4.5, z + 3.5));
  return Math.exp(-distance / 1.1);
}
