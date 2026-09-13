import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

let template: THREE.Group;
let loading: Promise<void> | undefined;

export function loadFlyModel() {
  loading ??= new GLTFLoader()
    .loadAsync("/models/fruitfly.glb")
    .then((gltf) => {
      template = gltf.scene;
    });
  return loading;
}

// Simplified anatomical Flybody meshes, Google DeepMind / HHMI Janelia,
// Apache-2.0. Import provenance and transformations: docs/assets.md.
export function makeFly(color = "#c6eaa0") {
  const group = template.clone(true);
  const materials = new Map<THREE.Material, THREE.Material>();
  group.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry = node.geometry.clone();
    const copy = (source: THREE.MeshStandardMaterial) => {
      if (!materials.has(source)) {
        const material = source.clone();
        // Preserve natural tan/brown anatomy; identification color stays subtle.
        if (material.name === "body")
          material.color.lerp(new THREE.Color(color), 0.06);
        if (material.transparent) material.depthWrite = false;
        materials.set(source, material);
      }
      return materials.get(source)!;
    };
    node.material = Array.isArray(node.material)
      ? node.material.map(copy)
      : copy(node.material);
    node.castShadow = true;
    node.receiveShadow = true;
  });
  const size = new THREE.Box3()
    .setFromObject(group)
    .getSize(new THREE.Vector3());
  group.scale.setScalar(0.18 / size.z);
  const wings = ["wing_right", "wing_left"].map((name) =>
    group.getObjectByName(name)!,
  );
  return { group, wings };
}
