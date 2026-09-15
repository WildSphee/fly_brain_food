import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Telemetry } from "./types";
import {
  AnatomyNavigation,
  anatomyViews,
  updateAnatomyGizmo,
  type AnatomyView,
} from "./AnatomyNavigation";
import { neuronClass, neuronRole } from "./neuronRoles";

interface Neuron {
  id: string;
  type: string;
  group: string;
  nt: string;
  side: string;
  modality: string | null;
  points: [number, number, number, number][];
}
interface Anatomy {
  neurons: Neuron[];
  edges: [string, string, number][];
  dataset: string;
  coordinate_space: string;
}
const colors: Record<string, string> = {
  visual: "#7cbcff",
  olfactory: "#c9eb85",
  taste: "#e2bc7d",
  thermal: "#e98f97",
  cb_intrinsic: "#8dd7b8",
  descending_neuron: "#b7a2f5",
  ascending_neuron: "#77cdd1",
  vnc_intrinsic: "#b1c992",
};
const neuronColor = (n: Neuron) => colors[n.modality || n.group] || "#afc5a4";

export function Network({ telemetry }: { telemetry: Telemetry | null }) {
  const [anatomy, setAnatomy] = useState<Anatomy | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<AnatomyView | null>("Front");
  const host = useRef<HTMLDivElement>(null);
  const gizmo = useRef<SVGSVGElement>(null);
  const snapView = useRef<(view: AnatomyView) => void>(() => {});
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const telemetryRef = useRef(telemetry);
  telemetryRef.current = telemetry;
  const resetView = useRef<() => void>(() => {});
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/circuit/anatomy", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error("Neuron anatomy unavailable");
        return r.json();
      })
      .then(setAnatomy)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!anatomy || !host.current) return;
    const container = host.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setClearColor(0, 0);
    renderer.domElement.setAttribute(
      "aria-label",
      "3D reconstruction of measured MaleCNS neuron skeletons. Drag to rotate, scroll to zoom, or select a neuron from the list.",
    );
    container.append(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 30);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 0.5;
    controls.maxDistance = 8;
    const bounds = new THREE.Box3();
    const point = new THREE.Vector3();
    for (const neuron of anatomy.neurons)
      for (const p of neuron.points)
        bounds.expandByPoint(point.set(p[0], -p[2], p[1]));
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const scale = 2 / Math.max(size.x, size.y, size.z);
    const neighbors = new Map<string, Set<string>>();
    for (const [a, b] of anatomy.edges) {
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      if (!neighbors.has(b)) neighbors.set(b, new Set());
      neighbors.get(a)!.add(b);
      neighbors.get(b)!.add(a);
    }
    const lines = anatomy.neurons.map((neuron) => {
      const positions: number[] = [];
      for (const p of neuron.points) {
        if (p[3] < 0) continue; // Preserve the source's disconnected fragments.
        const parent = neuron.points[p[3]];
        for (const q of [p, parent])
          positions.push(
            (q[0] - center.x) * scale,
            (-q[2] - center.y) * scale,
            (q[1] - center.z) * scale,
          );
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      const line = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({
          color: neuronColor(neuron),
          transparent: true,
          opacity: 0.6,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      line.userData.neuronId = neuron.id;
      scene.add(line);
      return line;
    });
    const updateNavigation = () => {
      if (gizmo.current) updateAnatomyGizmo(gizmo.current, camera);
      const direction = camera.position
        .clone()
        .sub(controls.target)
        .normalize();
      const aligned = anatomyViews.find(
        (v) => direction.dot(new THREE.Vector3(...v.direction)) > 0.999999,
      );
      setActiveView(aligned?.name || null);
    };
    controls.addEventListener("change", updateNavigation);
    const stopInertia = () => {
      // Flush any pending orbit/pan deltas before setting an exact new pose.
      controls.enableDamping = false;
      controls.update();
    };
    snapView.current = (view) => {
      const target = controls.target.clone();
      const distance = camera.position.distanceTo(target);
      stopInertia();
      controls.target.copy(target);
      const direction = anatomyViews.find((v) => v.name === view)!.direction;
      camera.position
        .copy(target)
        .addScaledVector(new THREE.Vector3(...direction), distance);
      // OrbitControls safely offsets polar views by epsilon to keep orbit usable.
      controls.update();
      controls.enableDamping = true;
    };
    resetView.current = () => {
      stopInertia();
      camera.position.set(0, 0, 3.4);
      controls.target.set(0, 0, 0);
      controls.update();
      controls.enableDamping = true;
    };
    resetView.current();
    const resize = () => {
      const width = container.clientWidth,
        height = container.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    let down = { x: 0, y: 0 };
    const pointerDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const pick = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.params.Line.threshold = 0.012;
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          1 - ((e.clientY - rect.top) / rect.height) * 2,
        ),
        camera,
      );
      const hit = ray.intersectObjects(lines)[0];
      if (hit) setSelected(hit.object.userData.neuronId);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pick);
    let frame = 0;
    const draw = () => {
      const active = new Map(
        telemetryRef.current?.activity.map((n) => [n.id, n.hz]) || [],
      );
      for (const line of lines) {
        const id = line.userData.neuronId;
        line.material.opacity = selectedRef.current
          ? selectedRef.current === id
            ? 1
            : neighbors.get(selectedRef.current)?.has(id)
              ? 0.4
              : 0.045
          : active.has(id) && active.get(id)! > 0
            ? 0.85
            : 0.42;
      }
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.removeEventListener("change", updateNavigation);
      controls.dispose();
      snapView.current = () => {};
      resetView.current = () => {};
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pick);
      lines.forEach((line) => {
        line.geometry.dispose();
        line.material.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [anatomy]);
  if (!anatomy)
    return (
      <div className="graph-loading">
        {error || "Loading measured neuron anatomy…"}
      </div>
    );
  const neuron = anatomy.neurons.find((n) => n.id === selected);
  const role = neuron ? neuronRole(neuron) : null;
  const descendingCount = anatomy.neurons.filter(
    (n) => n.group === "descending_neuron",
  ).length;
  const ascendingCount = anatomy.neurons.filter(
    (n) => n.group === "ascending_neuron",
  ).length;
  const activity = telemetry?.activity.find((n) => n.id === selected);
  const neuronById = new Map(anatomy.neurons.map((n) => [n.id, n]));
  const partners = selected
    ? anatomy.edges.filter(([a, b]) => a === selected || b === selected)
    : [];
  return (
    <div className="anatomy-view">
      <div className="anatomy-heading">
        <div>
          <span className="eyebrow">MALE CNS · RECONSTRUCTED ANATOMY</span>
          <h2>Neural circuit</h2>
          <p>
            {anatomy.neurons.length} real neurons from the 4,390-neuron circuit
            · {anatomy.edges.length} measured connections in this sample
            <span className="anatomy-class-summary">
              {descendingCount} descending · {ascendingCount} ascending ·{" "}
              {anatomy.neurons.length - descendingCount - ascendingCount}{" "}
              sensory & local
            </span>
          </p>
        </div>
        <button
          className="anatomy-reset"
          onClick={() => {
            resetView.current();
            setSelected(null);
          }}
        >
          Reset view
        </button>
      </div>
      <div className="anatomy-content">
        <div className="anatomy-canvas" ref={host}>
          <AnatomyNavigation
            svgRef={gizmo}
            active={activeView}
            onSnap={(view) => snapView.current(view)}
          />
          <span className="anatomy-hint">
            Drag to rotate · Scroll to zoom · Click a branch
          </span>
        </div>
        <aside className="anatomy-sidebar" aria-label="Reconstructed neurons">
          <div className="node-details">
            {neuron ? (
              <>
                <span className="eyebrow">SELECTED NEURON</span>
                <h3>
                  {neuron.type} <small>{neuron.side}</small>
                </h3>
                <span
                  className="neuron-class"
                  style={{ color: neuronColor(neuron) }}
                >
                  {neuronClass(neuron.group)}
                </span>
                {role && (
                  <div className="neuron-role">
                    <strong>{role.title}</strong>
                    <p>{role.description}</p>
                    <small>{role.evidence}</small>
                    {role.source && (
                      <a
                        href={role.source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {role.source.label} ↗
                      </a>
                    )}
                    {["descending_neuron", "ascending_neuron"].includes(
                      neuron.group,
                    ) && (
                      <p className="neuron-side-note">
                        L/R marks anatomical side, not control of a single leg.
                      </p>
                    )}
                  </div>
                )}
                <p>
                  Body ID {neuron.id}
                  <br />
                  {neuron.nt}
                  <br />
                  {partners.length} measured links in this sample
                  <br />
                  {activity
                    ? `${activity.hz.toFixed(1)} Hz · model activity`
                    : "Outside the live activity sample"}
                </p>
                {partners.length > 0 && (
                  <details className="anatomy-connections" key={neuron.id}>
                    <summary>{partners.length} measured links</summary>
                    <div>
                      {[...partners]
                        .sort((a, b) => b[2] - a[2])
                        .map(([a, b, weight]) => {
                          const outgoing = a === neuron.id;
                          const id = outgoing ? b : a;
                          const target = neuronById.get(id)!;
                          return (
                            <button
                              key={`${a}-${b}`}
                              data-neuron-id={id}
                              title={`${outgoing ? "Output to" : "Input from"} ${target.type} (${id}) · ${weight} synapses`}
                              onClick={() => setSelected(id)}
                            >
                              <span>
                                {outgoing ? "→" : "←"} {target.type}
                              </span>
                              <small>{weight}</small>
                            </button>
                          );
                        })}
                    </div>
                  </details>
                )}
              </>
            ) : (
              <p>
                Select a neuron to highlight its branches and connected neurons.
              </p>
            )}
          </div>
          <div className="anatomy-neurons">
            {anatomy.neurons.map((n) => (
              <button
                key={n.id}
                aria-label={`Neuron ${n.id} ${n.type}`}
                aria-pressed={selected === n.id}
                onClick={() => setSelected(selected === n.id ? null : n.id)}
              >
                <i style={{ background: neuronColor(n) }} />
                <span>
                  {n.type}
                  <em>{neuronClass(n.group)}</em>
                </span>
                <small>{n.side}</small>
              </button>
            ))}
          </div>
        </aside>
      </div>
      <div className="anatomy-footer">
        <span>
          Original EM coordinates · Centerline branches, not synapse locations ·
          Brightness reflects model activity
        </span>
        <a
          href="https://male-cns.janelia.org/download/"
          target="_blank"
          rel="noreferrer"
        >
          MaleCNS · FlyEM / Cambridge / MRC LMB / Google · CC BY 4.0 ↗
        </a>
      </div>
    </div>
  );
}
