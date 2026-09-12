import { useEffect, useState } from "react";
import type { Telemetry } from "./types";
interface Node {
  id: string;
  type: string;
  group: string;
  nt: string;
  side: string;
}
interface Graph {
  nodes: Node[];
  edges: [string, string, number][];
  view: string;
}
export function Network({ telemetry }: { telemetry: Telemetry | null }) {
  const [graph, setGraph] = useState<Graph | null>(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<Node | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/circuit/graph", { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw Error("Circuit graph unavailable");
        return r.json();
      })
      .then(setGraph)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, []);
  if (!graph)
    return (
      <div className="graph-loading">
        {error || "Reading measured connections…"}
      </div>
    );
  const positions = new Map(
    graph.nodes.map((n, i) => {
      const angle = i * 2.39996;
      const radius = 35 + Math.sqrt(i / graph.nodes.length) * 205;
      return [
        n.id,
        {
          x: 340 + Math.cos(angle) * radius * 1.25,
          y: 285 + Math.sin(angle) * radius,
        },
      ];
    }),
  );
  const active = new Map(telemetry?.activity.map((n) => [n.id, n.hz]) || []);
  return (
    <div className="network-view">
      <div className="network-heading">
        <h2>Neural circuit</h2>
        <p>120 neurons · select a node</p>
      </div>
      <svg
        className="network-svg"
        viewBox="0 0 680 570"
        aria-label="Sample of measured MaleCNS connectivity"
      >
        {graph.edges.map(([a, b, w]) => {
          const p = positions.get(a)!,
            q = positions.get(b)!;
          return (
            <line
              key={`${a}-${b}`}
              x1={p.x}
              y1={p.y}
              x2={q.x}
              y2={q.y}
              stroke={
                selected && (a === selected.id || b === selected.id)
                  ? "#dcf7b2"
                  : "#82a77c"
              }
              strokeOpacity={
                selected?.id === a || selected?.id === b ? 0.7 : 0.13
              }
              strokeWidth={Math.min(2, w / 500 + 0.25)}
            />
          );
        })}
        {graph.nodes.map((n) => {
          const p = positions.get(n.id)!,
            exc = n.nt === "acetylcholine";
          return (
            <g
              key={n.id}
              role="button"
              tabIndex={0}
              aria-label={`Neuron ${n.id} ${n.type}`}
              onClick={() => setSelected(n)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setSelected(n);
              }}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={selected?.id === n.id ? 9 : active.has(n.id) ? 6 : 3.7}
                fill={
                  exc
                    ? "#c8ed9e"
                    : n.nt === "gaba" || n.nt === "glutamate"
                      ? "#c195d3"
                      : "#849289"
                }
                opacity={active.has(n.id) ? 1 : 0.75}
              />
              <title>
                {n.type} · {n.id} · {n.nt}
              </title>
            </g>
          );
        })}
      </svg>
      <div className="network-legend">
        <span>
          <i className="legend-dot green" />
          Excitatory
        </span>
        <span>
          <i className="legend-dot purple" />
          Inhibitory assumption
        </span>
        <span>
          <i className="legend-dot gray" />
          Unmodeled transmitter
        </span>
      </div>
      <div className="node-details">
        {selected ? (
          <>
            <span className="eyebrow">SELECTED NEURON</span>
            <h3>
              {selected.type} <small>{selected.side}</small>
            </h3>
            <p>
              Body ID {selected.id} · {selected.nt}
              <br />
              {selected.group.replaceAll("_", " ")}
            </p>
            <a
              href={`https://neuprint.janelia.org/?dataset=male-cns%3Av1.0`}
              target="_blank"
              rel="noreferrer"
            >
              Explore in neuPrint ↗
            </a>
          </>
        ) : (
          <p>
            Lines represent real synaptic connections.
            <br />
            This layout is illustrative, not anatomical.
          </p>
        )}
      </div>
    </div>
  );
}
