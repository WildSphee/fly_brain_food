import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";

export interface MeshCollider {
  mesh: THREE.Mesh;
  collider: RAPIER.Collider;
}

// Triangle colliders retain sink basins, mug handles, and spaces between stool legs.
export function collideModel(
  object: THREE.Object3D,
  world: RAPIER.World,
  rapier: typeof RAPIER,
): MeshCollider[] {
  const result: MeshCollider[] = [];
  object.updateWorldMatrix(true, true);
  object.traverse((mesh) => {
    if (!(mesh instanceof THREE.Mesh)) return;
    const geometry = mesh.geometry;
    const position = new THREE.Vector3(),
      rotation = new THREE.Quaternion(),
      scale = new THREE.Vector3();
    mesh.matrixWorld.decompose(position, rotation, scale);
    const attribute = geometry.getAttribute("position");
    const vertices = new Float32Array(attribute.count * 3);
    for (let i = 0; i < attribute.count; i++) {
      vertices[i * 3] = attribute.getX(i) * scale.x;
      vertices[i * 3 + 1] = attribute.getY(i) * scale.y;
      vertices[i * 3 + 2] = attribute.getZ(i) * scale.z;
    }
    const indices = geometry.index
      ? Uint32Array.from(geometry.index.array)
      : Uint32Array.from({ length: attribute.count }, (_, i) => i);
    const collider = world.createCollider(
      rapier.ColliderDesc.trimesh(vertices, indices)
        .setTranslation(position.x, position.y, position.z)
        .setRotation(rotation)
        .setFriction(0.65),
    );
    result.push({ mesh, collider });
  });
  return result;
}
export function moveColliders(colliders: MeshCollider[]) {
  const position = new THREE.Vector3(),
    rotation = new THREE.Quaternion();
  for (const { mesh, collider } of colliders) {
    mesh.getWorldPosition(position);
    mesh.getWorldQuaternion(rotation);
    collider.setTranslation(position);
    collider.setRotation(rotation);
  }
}
