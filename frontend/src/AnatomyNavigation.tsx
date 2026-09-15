import type { RefObject } from "react";
import * as THREE from "three";

// These are display axes (source X / -Z / Y), not anatomical direction labels.
export const anatomyViews = [
  { name: "Right", axis: "X", direction: [1, 0, 0], color: "#ed8d91" },
  { name: "Left", axis: "−X", direction: [-1, 0, 0], color: "#ed8d91" },
  { name: "Top", axis: "Y", direction: [0, 1, 0], color: "#b7db8b" },
  { name: "Bottom", axis: "−Y", direction: [0, -1, 0], color: "#b7db8b" },
  { name: "Front", axis: "Z", direction: [0, 0, 1], color: "#86b9ed" },
  { name: "Back", axis: "−Z", direction: [0, 0, -1], color: "#86b9ed" },
] as const;
export type AnatomyView = (typeof anatomyViews)[number]["name"];

// Update the small orientation widget from the actual camera, including free orbit.
export function updateAnatomyGizmo(svg: SVGSVGElement, camera: THREE.Camera) {
  const inverse = camera.quaternion.clone().invert();
  const projected = anatomyViews.map((view) => ({
    view,
    point: new THREE.Vector3(...view.direction).applyQuaternion(inverse),
  }));
  for (const { view, point } of projected) {
    const x = 56 + point.x * 35;
    const y = 56 - point.y * 35;
    const line = svg.querySelector(`[data-line="${view.name}"]`)!;
    line.setAttribute("x2", String(x));
    line.setAttribute("y2", String(y));
    const tip = svg.querySelector<SVGGElement>(`[data-axis="${view.name}"]`)!;
    tip.setAttribute("transform", `translate(${x}, ${y})`);
    tip.style.opacity = point.z < -0.01 ? "0.45" : "1";
  }
  // Paint far ends before near ends when looking directly down an axis.
  const tips = svg.querySelector(".anatomy-axis-tips")!;
  for (const { view } of projected.sort((a, b) => a.point.z - b.point.z))
    tips.append(svg.querySelector(`[data-axis="${view.name}"]`)!);
}

export function AnatomyNavigation({
  svgRef,
  active,
  onSnap,
}: {
  svgRef: RefObject<SVGSVGElement | null>;
  active: AnatomyView | null;
  onSnap: (view: AnatomyView) => void;
}) {
  return (
    <div
      className="anatomy-navigation"
      role="group"
      aria-label="View direction"
    >
      <svg ref={svgRef} viewBox="0 0 112 112" aria-label="Camera orientation">
        {anatomyViews.map((v) => (
          <line
            key={v.name}
            data-line={v.name}
            x1="56"
            y1="56"
            x2="56"
            y2="56"
            stroke={v.color}
            strokeOpacity="0.5"
          />
        ))}
        <circle cx="56" cy="56" r="3" fill="#c1d1bb" />
        <g className="anatomy-axis-tips">
          {anatomyViews.map((v) => (
            <g
              key={v.name}
              data-axis={v.name}
              role="button"
              tabIndex={0}
              aria-label={`Snap to ${v.name.toLowerCase()} view`}
              onClick={() => onSnap(v.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSnap(v.name);
                }
              }}
            >
              <title>
                {v.name} · {v.axis}
              </title>
              <circle r="11" fill="#122019" stroke={v.color} />
              <text textAnchor="middle" dy="0.35em" fill={v.color}>
                {v.axis}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <div className="anatomy-view-buttons">
        {anatomyViews.map((v) => (
          <button
            key={v.name}
            aria-pressed={active === v.name}
            onClick={() => onSnap(v.name)}
          >
            {v.name}
          </button>
        ))}
      </div>
      <span title="Directions use the viewer coordinate axes, not anatomical left/right.">
        {active || "Free orbit"} · view axes
      </span>
    </div>
  );
}
