import * as THREE from "three";

export type Surface =
  | "marble"
  | "wood"
  | "metal"
  | "plaster"
  | "fabric"
  | "paint"
  | "ceramic"
  | "brass";
const assets = {
  marble: "Marble012",
  wood: "Wood049",
  metal: "Metal032",
  plaster: "Plaster001",
  fabric: "Fabric032",
};

// Real, locally vendored CC0 maps. A second UV channel preserves Kenney's color atlases.
export class KitchenMaterials {
  readonly ready: Promise<THREE.Texture[]>;
  private maps = new Map<string, THREE.Texture>();
  constructor() {
    const loader = new THREE.TextureLoader();
    const pending: Promise<THREE.Texture>[] = [];
    for (const [surface, asset] of Object.entries(assets)) {
      for (const channel of ["Color", "NormalGL", "Roughness"]) {
        pending.push(
          new Promise((resolve, reject) => {
            const texture = loader.load(
              `/materials/${asset}_1K-JPG_${channel}.jpg`,
              resolve,
              undefined,
              reject,
            );
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.channel = 1;
            texture.anisotropy = 4;
            if (channel === "Color") texture.colorSpace = THREE.SRGBColorSpace;
            this.maps.set(`${surface}/${channel}`, texture);
          }),
        );
      }
    }
    this.ready = Promise.all(pending);
  }
  material(surface: Surface, color = "#ffffff") {
    const source =
      surface === "paint" || surface === "ceramic"
        ? "plaster"
        : surface === "brass"
          ? "metal"
          : surface;
    const metallic = surface === "metal" || surface === "brass";
    const m = new THREE.MeshStandardMaterial({
      color,
      map: ["paint", "ceramic", "brass", "metal"].includes(surface)
        ? null
        : this.maps.get(`${source}/Color`),
      normalMap: this.maps.get(`${source}/NormalGL`),
      roughnessMap: this.maps.get(`${source}/Roughness`),
      roughness:
        surface === "marble"
          ? 0.48
          : surface === "ceramic"
            ? 0.3
            : metallic
              ? 0.48
              : surface === "paint"
                ? 0.65
                : 0.9,
      metalness: metallic ? 0.85 : 0,
    });
    m.name = surface;
    m.normalScale.setScalar(
      surface === "paint" || surface === "ceramic"
        ? 0.06
        : surface === "marble"
          ? 0.2
          : 0.45,
    );
    return m;
  }
  decorate(object: THREE.Object3D, name: string) {
    object.updateMatrixWorld(true);
    object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.geometry = node.geometry.clone();
      if (name.startsWith("food-")) {
        // Keep authored UVs and scan textures. Each food owns its material so
        // spoilage tint and disposal never mutate another serving or the cache.
        node.material = Array.isArray(node.material)
          ? node.material.map((material) => material.clone())
          : node.material.clone();
        return;
      }
      projectUV(node, name === "apple" || name === "banana" ? 0.12 : 0.8);
      const decorate = (original: THREE.MeshStandardMaterial) => {
        const label = original.name.toLowerCase();
        let surface: Surface | null = label.includes("metal")
          ? "metal"
          : label.includes("wood")
            ? "wood"
            : null;
        if (name === "kitchenSink" && label.includes("wood")) surface = "paint";
        if (name === "kitchenFridgeLarge" && label.includes("metal"))
          surface = "paint";
        if (name === "stoolBar" && label.includes("carpet")) surface = "fabric";
        if (["pot", "pan", "cooking-knife"].includes(name)) surface = "metal";
        if (["cutting-board", "knife-block"].includes(name)) surface = "wood";
        if (["mug", "bowl", "plate"].includes(name)) surface = "ceramic";
        if (surface) {
          const m = this.material(
            surface,
            surface === "fabric"
              ? "#b7ac94"
              : surface === "ceramic"
                ? "#e7e7de"
                : "#ffffff",
          );
          m.side = original.side;
          return m;
        }
        const m = original.clone();
        if (label.includes("plant")) m.color.set("#4c7040");
        m.roughness = name === "apple" || name === "bottle-oil" ? 0.32 : 0.8;
        m.normalMap = this.maps.get("plaster/NormalGL")!;
        m.normalScale.setScalar(label.includes("plant") ? 0.12 : 0.035);
        return m;
      };
      node.material = Array.isArray(node.material)
        ? node.material.map(decorate)
        : decorate(node.material);
    });
  }
  dispose() {
    this.maps.forEach((texture) => texture.dispose());
  }
}

// Planar projection at a consistent physical scale, including imported model transforms.
export function projectUV(mesh: THREE.Mesh, meters = 1.6) {
  mesh.updateWorldMatrix(true, false);
  const geometry = mesh.geometry;
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const uv = new Float32Array(positions.count * 2);
  const p = new THREE.Vector3(),
    n = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  for (let i = 0; i < positions.count; i++) {
    p.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
    n.fromBufferAttribute(normals, i).applyMatrix3(normalMatrix);
    const ax = Math.abs(n.x),
      ay = Math.abs(n.y),
      az = Math.abs(n.z);
    uv[i * 2] = (ax > ay && ax > az ? p.z : p.x) / meters;
    uv[i * 2 + 1] = (ay > ax && ay > az ? p.z : p.y) / meters;
  }
  geometry.setAttribute("uv1", new THREE.BufferAttribute(uv, 2));
}
