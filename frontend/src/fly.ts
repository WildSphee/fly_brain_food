import * as THREE from "three";

export function makeFly() {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({
    color: "#393526",
    roughness: 0.58,
  });
  const abdomen = new THREE.MeshStandardMaterial({
    color: "#a48649",
    roughness: 0.65,
  });
  const red = new THREE.MeshStandardMaterial({
    color: "#8f3529",
    roughness: 0.45,
  });
  function sphere(pos: number[], scale: number[], material: THREE.Material) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), material);
    m.position.set(...(pos as [number, number, number]));
    m.scale.set(...(scale as [number, number, number]));
    m.castShadow = true;
    group.add(m);
    return m;
  }
  sphere([0, 0, 0], [0.031, 0.032, 0.041], dark);
  sphere([0, -0.006, -0.052], [0.032, 0.027, 0.055], abdomen);
  for (let i = 0; i < 4; i++)
    sphere(
      [0, -0.005, -0.024 - i * 0.019],
      [0.032 - i * 0.003, 0.026 - i * 0.002, 0.004],
      dark,
    );
  sphere([0, 0.01, 0.041], [0.033, 0.027, 0.024], dark);
  sphere([-0.024, 0.016, 0.049], [0.017, 0.022, 0.017], red);
  sphere([0.024, 0.016, 0.049], [0.017, 0.022, 0.017], red);
  const wings: THREE.Group[] = [];
  const wingMat = new THREE.MeshPhysicalMaterial({
    color: "#e4ede8",
    transparent: true,
    opacity: 0.68,
    side: THREE.DoubleSide,
    roughness: 0.2,
    metalness: 0.12,
    depthWrite: false,
  });
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.02, 0.026, 0.006);
    group.add(pivot);
    const wing = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), wingMat);
    wing.scale.set(0.034, 0.0015, 0.078);
    wing.position.set(side * 0.048, 0, -0.042);
    wing.rotation.y = side * -0.6;
    pivot.add(wing);
    wings.push(pivot);
    for (let i = 0; i < 3; i++) {
      const points = [
        new THREE.Vector3(side * 0.02, -0.006, 0.025 - i * 0.025),
        new THREE.Vector3(side * 0.06, -0.026, 0.035 - i * 0.034),
        new THREE.Vector3(side * 0.077, -0.05, 0.056 - i * 0.05),
      ];
      const leg = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: "#494532" }),
      );
      group.add(leg);
    }
    const antenna = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(side * 0.012, 0.03, 0.06),
        new THREE.Vector3(side * 0.022, 0.048, 0.074),
      ]),
      new THREE.LineBasicMaterial({ color: "#50432b" }),
    );
    group.add(antenna);
  }
  return { group, wings };
}
