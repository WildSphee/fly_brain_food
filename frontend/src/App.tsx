import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  ArrowUp,
  BookOpen,
  Bug,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Crosshair,
  Eye,
  Flame,
  Focus,
  Leaf,
  Lightbulb,
  Maximize2,
  MousePointer2,
  Network as NetworkIcon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Snowflake,
  Sun,
  Thermometer,
  Trash2,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { KitchenWorld } from "./world";
import { initialOptions, defaultFoods, foodNames } from "./types";
import type {
  CameraMode,
  FoodKind,
  Options,
  Overlay,
  WorldStats,
} from "./types";
import { useBrain } from "./useBrain";
import { Network } from "./Network";

const initialStats: WorldStats = {
  elapsed: 0,
  speed: 0,
  altitude: 1.9,
  energy: 100,
  hunger: 68,
  temperature: 24,
  light: 0.8,
  odor: 0,
  behavior: "Connecting",
  x: -0.7,
  z: 1.6,
  fps: 0,
  distance: 0,
  foods: defaultFoods(),
  hour: 10.5,
};
const num = (value: number) => new Intl.NumberFormat("en-US").format(value);
const time = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
const hour = (h: number) =>
  `${Math.floor(h).toString().padStart(2, "0")}:${Math.floor((h % 1) * 60)
    .toString()
    .padStart(2, "0")}`;
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      className={`toggle ${checked ? "on" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
    >
      <span />
    </button>
  );
}
function Sparkline({
  values,
  large = false,
}: {
  values: number[];
  large?: boolean;
}) {
  const max = Math.max(1, ...values);
  return (
    <svg
      viewBox="0 0 260 50"
      preserveAspectRatio="none"
      className={large ? "sparkline large" : "sparkline"}
      aria-label="Measured mean neural firing rate history"
    >
      <path d="M0 45H260 M0 23H260" stroke="#ffffff0d" fill="none" />
      {values.length > 1 && (
        <>
          <path
            d={`M0 50 ${values.map((v, i) => `L${(i / (values.length - 1)) * 260} ${46 - (v / max) * 40}`).join(" ")} L260 50Z`}
            fill="#c7ed9410"
          />
          <polyline
            points={values
              .map(
                (v, i) =>
                  `${(i / (values.length - 1)) * 260},${46 - (v / max) * 40}`,
              )
              .join(" ")}
            fill="none"
            stroke="#c4e993"
            strokeWidth="1.5"
          />
        </>
      )}
    </svg>
  );
}

export default function App() {
  const [options, setOptions] = useState<Options>({ ...initialOptions });
  const [stats, setStats] = useState(initialStats);
  const [ready, setReady] = useState(false),
    [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<"habitat" | "circuit" | "log">("habitat");
  const [dialog, setDialog] = useState<"help" | "science" | null>(null);
  const [foodMenu, setFoodMenu] = useState(false),
    [sidebar, setSidebar] = useState(false);
  const [toast, setToast] = useState("");
  const [events, setEvents] = useState<{ time: string; message: string }[]>([]);
  const world = useRef<KitchenWorld | null>(null),
    container = useRef<HTMLDivElement>(null),
    dialogRef = useRef<HTMLDialogElement>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const onEvent = useCallback((message: string) => {
    setEvents((e) =>
      [{ time: new Date().toLocaleTimeString("en-GB"), message }, ...e].slice(
        0,
        150,
      ),
    );
    setToast(message);
  }, []);
  const brain = useBrain(world, ready, options, onEvent);
  const set = <K extends keyof Options>(key: K, value: Options[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));
  useEffect(() => {
    let cancelled = false;
    KitchenWorld.create(
      container.current!,
      (s) => {
        setStats(s);
        if (optionsRef.current.cycle)
          setOptions((o) => ({ ...o, hour: s.hour }));
      },
      onEvent,
      () => setOptions((o) => ({ ...o, placing: null })),
    )
      .then((w) => {
        if (cancelled) {
          w.dispose();
          return;
        }
        world.current = w;
        w.setOptions(optionsRef.current);
        setReady(true);
      })
      .catch((e) => {
        if (!cancelled)
          setLoadError(
            e instanceof Error ? e.message : "Unable to initialize WebGL",
          );
      });
    return () => {
      cancelled = true;
      world.current?.dispose();
      world.current = null;
    };
  }, [onEvent]);
  useEffect(() => {
    world.current?.setOptions(options);
  }, [options]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (dialog) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [dialog]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.closest(
          "input,select,textarea,button,dialog",
        )
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        setOptions((o) => ({ ...o, running: !o.running }));
      }
      if (e.code === "Escape") setOptions((o) => ({ ...o, placing: null }));
      if (["Digit1", "Digit2", "Digit3", "Digit4"].includes(e.code))
        setOptions((o) => ({
          ...o,
          camera: (
            {
              Digit1: "orbit",
              Digit2: "follow",
              Digit3: "eyes",
              Digit4: "fixed",
            } as Record<string, CameraMode>
          )[e.code],
        }));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const reset = () => {
    setOptions({ ...initialOptions });
    world.current?.reset();
    brain.reset();
    setStats(initialStats);
  };
  const exportSession = () => {
    const data = {
      exported_at: new Date().toISOString(),
      options,
      world: stats,
      circuit: brain.circuit,
      neural: brain.telemetry,
      events,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "fly-kitchen-experiment.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onEvent("Experiment snapshot exported");
  };
  const selectCamera = (mode: CameraMode) => {
    set("camera", mode);
    onEvent(
      `Camera · ${{ orbit: "Orbit", follow: "Third person", eyes: "Fly eye", fixed: "Fixed" }[mode]}`,
    );
  };
  return (
    <div className="app">
      <header className="header">
        <a className="brand" href="/" aria-label="Fly Kitchen home">
          <span className="brand-icon">
            <Bug size={24} strokeWidth={1.6} />
          </span>
          <span>
            fly<span className="brand-light">kitchen</span>
            <small>CONNECTOME PLAYGROUND</small>
          </span>
        </a>
        <div className="header-divider" />
        <span className="project-title">
          A small world. A real neural circuit.
        </span>
        <div className="header-right">
          <span className="version">EXPERIMENT 001</span>
          <button
            className="icon-button"
            aria-label="How to play"
            onClick={() => setDialog("help")}
          >
            <CircleHelp size={18} />
          </button>
          <button
            className="text-button source-button"
            onClick={() => setDialog("science")}
          >
            <BookOpen size={15} /> About the model <ArrowUpRight size={14} />
          </button>
          <div className="user-avatar">R</div>
        </div>
      </header>
      <nav className="topbar">
        <div className="tabs">
          <button
            className={tab === "habitat" ? "active" : ""}
            onClick={() => setTab("habitat")}
          >
            <Leaf size={16} /> Habitat
          </button>
          <button
            className={tab === "circuit" ? "active" : ""}
            onClick={() => setTab("circuit")}
          >
            <NetworkIcon size={16} /> Neural circuit
          </button>
          <button
            className={tab === "log" ? "active" : ""}
            onClick={() => setTab("log")}
          >
            <Clock3 size={16} /> Experiment log{" "}
            <span className="count">{events.length}</span>
          </button>
        </div>
        <div className="connection">
          <span className={`status-dot ${brain.status}`} />
          <span>
            {brain.status === "live"
              ? "Neural service connected"
              : brain.status === "connecting"
                ? "Connecting neural service"
                : "Neural service offline"}
          </span>
          <span className="mono">MaleCNS v1.0</span>
        </div>
      </nav>
      <main className="workspace">
        <aside className={`sidebar ${sidebar ? "mobile-open" : ""}`}>
          <div className="panel-heading">
            <span>
              <SlidersHorizontal size={15} /> Environment
            </span>
            <span className="eyebrow">LIVE</span>
          </div>
          <div className="sidebar-scroll">
            <section className="control-section">
              <div className="section-label">
                <Sun size={15} />
                <h3>Time & light</h3>
              </div>
              <div className="time-readout">
                <span>
                  {hour(options.hour)}
                  <small>
                    {options.hour >= 6 && options.hour < 18
                      ? "DAYTIME"
                      : "NIGHTTIME"}
                  </small>
                </span>
                <Sun size={29} strokeWidth={1.2} />
              </div>
              <input
                aria-label="Time of day"
                type="range"
                min="0"
                max="23.99"
                step=".1"
                value={options.hour}
                onChange={(e) => set("hour", +e.target.value)}
              />
              <div className="range-labels">
                <span>00:00</span>
                <span>12:00</span>
                <span>24:00</span>
              </div>
              <div className="setting-row">
                <span>Day / night cycle</span>
                <Toggle
                  label="Day night cycle"
                  checked={options.cycle}
                  onChange={() => set("cycle", !options.cycle)}
                />
              </div>
              <label className="slider-label">
                Sunlight{" "}
                <span>
                  {Math.round(options.sunlight * 100)}
                  <small>%</small>
                </span>
              </label>
              <input
                aria-label="Sunlight intensity"
                type="range"
                min="0"
                max="1"
                step=".01"
                value={options.sunlight}
                onChange={(e) => set("sunlight", +e.target.value)}
              />
              <div className="setting-row">
                <span>
                  <Lightbulb size={14} /> Kitchen light
                </span>
                <Toggle
                  label="Kitchen light"
                  checked={options.lamp}
                  onChange={() => set("lamp", !options.lamp)}
                />
              </div>
            </section>
            <section className="control-section">
              <div className="section-label">
                <Thermometer size={15} />
                <h3>Climate</h3>
                <span className="unit">°C</span>
              </div>
              <label className="slider-label">
                Room temperature{" "}
                <span>
                  {options.temperature}
                  <small>°</small>
                </span>
              </label>
              <input
                aria-label="Room temperature"
                className="temperature-slider"
                type="range"
                min="10"
                max="40"
                step="1"
                value={options.temperature}
                onChange={(e) => set("temperature", +e.target.value)}
              />
              <div className="range-labels">
                <span>10° cool</span>
                <span>40° warm</span>
              </div>
              <div className="setting-row">
                <span>
                  <Flame size={14} className="orange" /> Stovetop heat
                </span>
                <Toggle
                  label="Stovetop heat"
                  checked={options.stove}
                  onChange={() => set("stove", !options.stove)}
                />
              </div>
              <div className="setting-row">
                <span>
                  <Snowflake size={14} className="blue" /> Fridge cooling
                </span>
                <Toggle
                  label="Fridge cooling"
                  checked={options.fridge}
                  onChange={() => set("fridge", !options.fridge)}
                />
              </div>
              <div className="setting-row">
                <span>
                  <Wind size={14} /> Open window
                </span>
                <Toggle
                  label="Open window"
                  checked={options.windowOpen}
                  onChange={() => set("windowOpen", !options.windowOpen)}
                />
              </div>
            </section>
            <section className="control-section food-section">
              <div className="section-label">
                <Leaf size={15} />
                <h3>Food sources</h3>
                <span className="count">{stats.foods.length}</span>
              </div>
              <p className="section-hint">A little temptation on the table.</p>
              <div className="food-list">
                {stats.foods.map((f) => (
                  <div className="food-row" key={f.id}>
                    <img src={`/food-${f.kind}.svg`} alt="" />
                    <span>
                      {foodNames[f.kind]}
                      <small>
                        {f.remaining < 0.99
                          ? `${Math.round(f.remaining * 100)}% remaining`
                          : "Available"}
                        <i />
                      </small>
                    </span>
                    <button
                      className="icon-button subtle"
                      aria-label={`Remove ${foodNames[f.kind]} ${f.id}`}
                      onClick={() => world.current?.removeFood(f.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="food-add-wrap">
                <button
                  className="add-food"
                  disabled={!ready || stats.foods.length >= 12}
                  onClick={() => setFoodMenu(!foodMenu)}
                >
                  <Plus size={14} /> Add food <ChevronDown size={13} />
                </button>
                {foodMenu && (
                  <div className="food-menu">
                    {(["banana", "apple", "bread", "cheese"] as FoodKind[]).map(
                      (k) => (
                        <button
                          key={k}
                          onClick={() => {
                            set("placing", k);
                            setTab("habitat");
                            setFoodMenu(false);
                            setSidebar(false);
                          }}
                        >
                          <img src={`/food-${k}.svg`} alt="" />
                          {foodNames[k]}
                          <MousePointer2 size={12} />
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
            </section>
            <section className="control-section overlay-controls">
              <div className="section-label">
                <Eye size={15} />
                <h3>Field overlays</h3>
              </div>
              <div className="overlay-grid">
                {(
                  [
                    ["none", "Natural"],
                    ["odor", "Odor"],
                    ["thermal", "Thermal"],
                    ["light", "Light"],
                  ] as [Overlay, string][]
                ).map(([v, label]) => (
                  <button
                    key={v}
                    className={options.overlay === v ? "selected" : ""}
                    onClick={() => set("overlay", v)}
                  >
                    {v === "none" ? (
                      <Eye size={13} />
                    ) : v === "odor" ? (
                      <Wind size={13} />
                    ) : v === "thermal" ? (
                      <Thermometer size={13} />
                    ) : (
                      <Sun size={13} />
                    )}{" "}
                    {label}
                  </button>
                ))}
              </div>
            </section>
          </div>
          <div className="sidebar-foot">
            <span className="status-dot live" /> Changes apply in real time
          </div>
        </aside>
        <div className="center-panel">
          <div className="habitat-heading">
            <div>
              <span className="eyebrow">
                HABITAT 01 <span>/</span> DOMESTIC ENVIRONMENT
              </span>
              <h1>
                The morning kitchen{" "}
                <span className="live-pill">
                  {options.running ? "LIVE" : "PAUSED"}
                </span>
              </h1>
            </div>
            <div className="heading-actions">
              <button
                className="icon-button mobile-settings"
                aria-label="Toggle environment settings"
                onClick={() => setSidebar(!sidebar)}
              >
                <Settings2 size={19} />
              </button>
              <button
                className="icon-button"
                aria-label="Reset experiment"
                title="Reset experiment"
                onClick={reset}
              >
                <RotateCcw size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="Expand habitat"
                title="Toggle fullscreen"
                onClick={() => {
                  if (document.fullscreenElement)
                    void document.exitFullscreen();
                  else
                    void document
                      .querySelector(".center-panel")
                      ?.requestFullscreen()
                      .catch(() =>
                        onEvent("Fullscreen is unavailable in this browser"),
                      );
                }}
              >
                <Maximize2 size={17} />
              </button>
            </div>
          </div>
          <div className="viewport" data-testid="viewport">
            <div
              ref={container}
              className={`canvas-host ${tab !== "habitat" ? "hidden-canvas" : ""}`}
            />
            {tab === "habitat" && (
              <>
                <div className="viewport-top">
                  <div className="camera-switch">
                    {(
                      [
                        ["orbit", "Orbit", <MousePointer2 size={13} />],
                        ["follow", "Follow", <Focus size={14} />],
                        ["eyes", "Fly eye", <Eye size={14} />],
                        ["fixed", "Fixed", <Crosshair size={13} />],
                      ] as const
                    ).map(([v, label, icon]) => (
                      <button
                        key={v}
                        aria-label={`${label} camera`}
                        className={options.camera === v ? "selected" : ""}
                        onClick={() => selectCamera(v)}
                      >
                        {icon}
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="weather-chip">
                    <Sun size={13} />
                    {hour(options.hour)}
                    <i />
                    {options.temperature}°C
                  </div>
                </div>
                <div className="scene-tag">
                  <span className="status-dot live" />
                  <span>DROSOPHILA MELANOGASTER</span>
                </div>
                <div className="view-bottom">
                  <div className="camera-hint">
                    {options.camera === "orbit" ? (
                      <>
                        <MousePointer2 size={14} />
                        <span>
                          Drag to orbit <i>·</i> Scroll to zoom
                        </span>
                      </>
                    ) : options.camera === "eyes" ? (
                      <>
                        <Eye size={14} />
                        <span>
                          Fly-eye view <i>·</i> Press 1 to return
                        </span>
                      </>
                    ) : (
                      <>
                        <Focus size={14} />
                        <span>
                          {options.camera === "follow"
                            ? "Following specimen"
                            : "Fixed observation camera"}
                        </span>
                      </>
                    )}
                  </div>
                  <button
                    className={`trail-toggle ${options.trail ? "selected" : ""}`}
                    onClick={() => set("trail", !options.trail)}
                  >
                    <Activity size={13} /> Flight trail
                  </button>
                </div>
                {options.placing && (
                  <div className="placement-banner">
                    <MousePointer2 size={16} /> Click a surface to place{" "}
                    {foodNames[options.placing].toLowerCase()}
                    <button
                      aria-label="Cancel placement"
                      onClick={() => set("placing", null)}
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}
                {!ready && (
                  <div className="loading-scene">
                    <Bug size={38} />
                    <h2>
                      {loadError
                        ? "Habitat could not load"
                        : "Preparing your little world"}
                    </h2>
                    <p>{loadError || "Loading local 3D assets and physics…"}</p>
                    {loadError && (
                      <button onClick={() => location.reload()}>
                        Try again
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
            {tab === "circuit" && <Network telemetry={brain.telemetry} />}
            {tab === "log" && (
              <div className="experiment-log">
                <div className="log-heading">
                  <span className="eyebrow">OBSERVATION NOTEBOOK</span>
                  <h2>Every little change.</h2>
                  <p>Your current session, recorded as you explore.</p>
                  <button className="text-button" onClick={exportSession}>
                    <ArrowDownToLine size={15} /> Export experiment
                  </button>
                </div>
                {events.map((e, i) => (
                  <div className="event" key={`${e.time}-${i}`}>
                    <span>{e.time}</span>
                    <i />
                    <p>{e.message}</p>
                  </div>
                ))}
                {!events.length && (
                  <p>No events yet. Start exploring the habitat.</p>
                )}
              </div>
            )}
          </div>
          <div className="transport">
            <div className="transport-main">
              <button
                className={`play-button ${options.running ? "running" : ""}`}
                disabled={!ready}
                aria-label={
                  options.running ? "Pause simulation" : "Resume simulation"
                }
                onClick={() => set("running", !options.running)}
              >
                {options.running ? (
                  <Pause size={16} fill="currentColor" />
                ) : (
                  <Play size={16} fill="currentColor" />
                )}
              </button>
              <span className="sim-time">
                {time(stats.elapsed)}
                <small>SIMULATION TIME</small>
              </span>
              <div className="speed-select">
                {[0.5, 1, 2].map((n) => (
                  <button
                    key={n}
                    className={options.speed === n ? "selected" : ""}
                    onClick={() => set("speed", n)}
                  >
                    {n}×
                  </button>
                ))}
              </div>
            </div>
            <div className="control-mode">
              <button
                className={options.autonomous ? "selected" : ""}
                onClick={() => set("autonomous", true)}
              >
                <NetworkIcon size={13} /> Neural control
              </button>
              <button
                className={!options.autonomous ? "selected" : ""}
                onClick={() => set("autonomous", false)}
              >
                <MousePointer2 size={13} /> Manual
              </button>
            </div>
          </div>
          {!options.autonomous && (
            <div className="manual-hint">
              <span>
                <kbd>W</kbd>
                <kbd>S</kbd> forward / back
              </span>
              <span>
                <kbd>A</kbd>
                <kbd>D</kbd> turn
              </span>
              <span>
                <kbd>E</kbd>
                <kbd>Q</kbd> ascend / descend
              </span>
              <span>
                <kbd>F</kbd> land / takeoff
              </span>
            </div>
          )}
          <div className="telemetry-strip">
            <div className="specimen-card">
              <div className="fly-portrait">
                <Bug size={35} strokeWidth={1} />
              </div>
              <div>
                <span className="eyebrow">SPECIMEN 001</span>
                <strong>Little explorer</strong>
                <span className="behavior">
                  <span className="status-dot live" />
                  {stats.behavior}
                </span>
              </div>
            </div>
            <div className="metric">
              <span>Speed</span>
              <strong>
                {stats.speed.toFixed(2)} <small>m/s</small>
              </strong>
              <div className="mini-meter">
                <i style={{ width: `${Math.min(100, stats.speed * 100)}%` }} />
              </div>
            </div>
            <div className="metric">
              <span>Height</span>
              <strong>
                {stats.altitude.toFixed(2)} <small>m</small>
              </strong>
              <div className="mini-meter">
                <i style={{ width: `${(stats.altitude / 3.5) * 100}%` }} />
              </div>
            </div>
            <div className="metric">
              <span>
                <Zap size={11} /> Energy
              </span>
              <strong>
                {Math.round(stats.energy)} <small>%</small>
              </strong>
              <div className="mini-meter">
                <i style={{ width: `${stats.energy}%` }} />
              </div>
            </div>
            <div className="metric">
              <span>Hunger</span>
              <strong>
                {Math.round(stats.hunger)} <small>%</small>
              </strong>
              <div className="mini-meter warm">
                <i style={{ width: `${stats.hunger}%` }} />
              </div>
            </div>
          </div>
        </div>
        <aside className="neural-panel">
          <div className="panel-heading">
            <span>
              <NetworkIcon size={16} /> Inside the brain
            </span>
            <span className="status-dot live" />
          </div>
          <div className="brain-overview">
            <div className="brain-visual">
              <svg viewBox="0 0 260 130">
                <defs>
                  <radialGradient id="brainGlow">
                    <stop offset="0" stopColor="#bbde8d" stopOpacity=".12" />
                    <stop offset="1" stopColor="#bbde8d" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <ellipse
                  cx="130"
                  cy="65"
                  rx="100"
                  ry="65"
                  fill="url(#brainGlow)"
                />
                {Array.from({ length: 62 }, (_, i) => {
                  const side = i % 2 ? 1 : -1,
                    t = (i / 62) * Math.PI * 7,
                    x = 130 + side * (16 + Math.abs(Math.cos(t)) * 62),
                    y = 65 + Math.sin(t) * 35;
                  return (
                    <g key={i}>
                      <path
                        d={`M130 89 Q${130 + side * 12} ${y - 12} ${x} ${y}`}
                        fill="none"
                        stroke="#b9d998"
                        strokeWidth=".7"
                        strokeOpacity=".22"
                      />
                      <circle
                        cx={x}
                        cy={y}
                        r={i % 7 === 0 ? 2.1 : 1.1}
                        fill="#c2e898"
                        opacity={0.3 + (i % 4) * 0.15}
                      />
                    </g>
                  );
                })}
                <path
                  d="M124 89 Q116 113 124 119 M135 89 Q145 113 135 119"
                  fill="none"
                  stroke="#bddc96"
                  strokeOpacity=".5"
                />
              </svg>
              <span>CONNECTOME-BASED DYNAMICS</span>
            </div>
            <div className="neuron-counts">
              <div>
                <strong>
                  {brain.circuit ? num(brain.circuit.neurons) : "—"}
                </strong>
                <span>neurons in circuit</span>
              </div>
              <div>
                <strong>
                  {brain.circuit
                    ? (brain.circuit.synapses / 1e6).toFixed(2)
                    : "—"}
                  <small>M</small>
                </strong>
                <span>measured synapses</span>
              </div>
            </div>
            <div className="model-badge">
              <span className="status-dot live" /> MaleCNS{" "}
              <span>v1.0 · bounded circuit</span>
            </div>
          </div>
          <section className="neural-section">
            <div className="section-label">
              <Activity size={14} />
              <h3>Neural activity</h3>
              <span className="live-text">LIVE</span>
            </div>
            <div className="activity-value">
              {brain.telemetry?.mean_hz.toFixed(1) || "0.0"}
              <span>
                Hz <small>mean firing rate</small>
              </span>
            </div>
            <Sparkline values={brain.history} />
            <div className="chart-legend">
              <span>Last {Math.min(70, brain.history.length)} samples</span>
              <span>{brain.telemetry?.active_neurons || 0} firing</span>
            </div>
          </section>
          <section className="neural-section">
            <div className="section-label">
              <ArrowUp size={14} />
              <h3>Sensory input</h3>
              <span className="unit">0—1</span>
            </div>
            {(
              [
                ["Odor", stats.odor, "green"],
                ["Light", stats.light, "yellow"],
                ["Heat", world.current?.sensors.heat || 0, "orange"],
                ["Cold", world.current?.sensors.cold || 0, "blue"],
                ["Taste", world.current?.sensors.taste || 0, "purple"],
              ] as [string, number, string][]
            ).map(([label, v, c]) => (
              <div className="signal-row" key={label}>
                <span>{label}</span>
                <div className={`signal-track ${c}`}>
                  <i style={{ width: `${Math.max(1, v * 100)}%` }} />
                </div>
                <span className="mono">{v.toFixed(2)}</span>
              </div>
            ))}
          </section>
          <section className="neural-section">
            <div className="section-label">
              <ChevronRight size={16} />
              <h3>Motor readout</h3>
            </div>
            <div className="motor-columns">
              <div>
                <span>Left DNs</span>
                <strong>
                  {brain.telemetry?.motor_left_hz.toFixed(1) || "0.0"}
                  <small> Hz</small>
                </strong>
              </div>
              <div>
                <span>Right DNs</span>
                <strong>
                  {brain.telemetry?.motor_right_hz.toFixed(1) || "0.0"}
                  <small> Hz</small>
                </strong>
              </div>
            </div>
            <p className="decoder-note">
              Descending activity → engineered flight controller
            </p>
          </section>
          <section className="neural-section interventions">
            <div className="setting-row">
              <span>Silence all neurons</span>
              <Toggle
                label="Silence all neurons"
                checked={options.silenced}
                onChange={() => {
                  set("silenced", !options.silenced);
                  onEvent(
                    options.silenced
                      ? "Neural transmission restored"
                      : "All neurons silenced · causal intervention",
                  );
                }}
              />
            </div>
            <label className="slider-label">
              Sensory gain{" "}
              <span>
                {options.gain.toFixed(1)}
                <small>×</small>
              </span>
            </label>
            <input
              aria-label="Sensory gain"
              type="range"
              min="0"
              max="2"
              step=".1"
              value={options.gain}
              onChange={(e) => set("gain", +e.target.value)}
            />
          </section>
          <button
            className="model-details"
            onClick={() => setDialog("science")}
          >
            <BookOpen size={14} /> Model & data provenance{" "}
            <ArrowUpRight size={14} />
          </button>
          {brain.error && (
            <p className="service-error" role="alert">
              {brain.error}
            </p>
          )}
        </aside>
      </main>
      <footer className="footer">
        <span>
          <span className="status-dot live" />{" "}
          {ready ? "Habitat ready" : "Loading habitat"}
          <i>·</i> Rapier physics <i>·</i> {stats.fps} FPS
        </span>
        <span>
          Real wiring. Experimental behavior.
          <button onClick={() => setDialog("science")}>
            Know the limits <ArrowUpRight size={11} />
          </button>
        </span>
        <span className="footer-right">
          {brain.telemetry?.compute_ms.toFixed(0) || "—"} ms / neural step{" "}
          <i>·</i> LOCAL SESSION
        </span>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={13} />
          </button>
        </div>
      )}
      <dialog
        ref={dialogRef}
        className="info-dialog"
        onCancel={() => setDialog(null)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setDialog(null);
        }}
      >
        <div className="dialog-content">
          <button
            className="dialog-close icon-button"
            aria-label="Close dialog"
            onClick={() => setDialog(null)}
          >
            <X size={20} />
          </button>
          {dialog === "help" ? (
            <>
              <span className="eyebrow">WELCOME TO FLY KITCHEN</span>
              <h2>
                Follow a very
                <br />
                <em>small curiosity.</em>
              </h2>
              <p>
                Explore a kitchen through a fly's eyes, then change its world
                and watch the neural circuit respond.
              </p>
              <div className="help-grid">
                <div>
                  <MousePointer2 />
                  <h3>Explore the room</h3>
                  <p>
                    Drag to orbit and scroll to zoom. Press 1 for orbit, 2 for
                    follow, 3 for fly eye, or 4 for a fixed camera.
                  </p>
                </div>
                <div>
                  <NetworkIcon />
                  <h3>Follow the signals</h3>
                  <p>
                    Neural control reads the real MaleCNS circuit. Change
                    sunlight, temperature, and food; watch input and firing
                    rates.
                  </p>
                </div>
                <div>
                  <Leaf />
                  <h3>Leave a snack</h3>
                  <p>
                    Choose Add food, then click the table, counter, or floor.
                    The fly feeds when it is close enough to taste food.
                  </p>
                </div>
                <div>
                  <MousePointer2 />
                  <h3>Take the controls</h3>
                  <p>
                    Choose Manual. W/S moves, A/D turns, E/Q changes height, F
                    lands or takes off. Space pauses. Press Escape to cancel
                    food placement.
                  </p>
                </div>
              </div>
              <p className="dialog-note">
                First person is a forward camera, not a compound-eye model. Fly
                visuals are enlarged for observation; body physics and
                controllers are approximations.
              </p>
            </>
          ) : (
            <>
              <span className="eyebrow">MODEL & DATA PROVENANCE</span>
              <h2>
                Real connections.
                <br />
                <em>Honest approximations.</em>
              </h2>
              <p>
                This experiment uses{" "}
                <b>
                  {brain.circuit ? num(brain.circuit.neurons) : "4,390"} real
                  MaleCNS neurons
                </b>
                , {brain.circuit ? num(brain.circuit.edges) : "251,004"}{" "}
                measured neuron-to-neuron connections, and their synapse counts.
                It is a bounded circuit, not the complete fly CNS.
              </p>
              <div className="science-equation">
                τₘ dV/dt = Vᵣ − V + g<br />
                τₛ dg/dt = −g
                <br />
                <span>wᵢⱼ = 0.275 mV × synapse count × transmitter sign</span>
              </div>
              <p>
                Rest/reset −52 mV · threshold −45 mV · membrane τ 20 ms ·
                synaptic τ 5 ms · delay 1.8 ms · refractory 2.2 ms. Integration
                uses 0.2 ms steps; each service update advances 20 ms of neural
                time, independently of the room's clock.
              </p>
              <p>
                Acetylcholine is modeled as excitatory, GABA and glutamate as
                inhibitory. Other or unknown transmitters have zero modeled
                weight ({brain.circuit?.excluded_transmitter_neurons ?? 426}{" "}
                neurons). These assumptions do not capture receptor-specific
                effects.
              </p>
              <p>
                <b>The sensory and motor bridges are experimental.</b> Odor
                activates annotated ORNs; taste activates a broad gustatory
                population; temperature drives TRNs; light drives an LC4
                projection proxy. LC4 is not a photoreceptor. Generic left/right
                descending populations feed a hand-built flight stabilizer. Side
                annotations do not prove turning direction. This is not a
                validated reconstruction of fly behavior.
              </p>
              <p>
                Physics models an enlarged 12 mm collision radius for accessible
                interaction. Flight is force-controlled; it does not solve
                flapping-wing aerodynamics. Thermal/odor/light fields are
                analytic approximations. No reinforcement learning or LLM is
                used.
              </p>
              <div className="source-links">
                <a
                  href="https://male-cns.janelia.org/download/"
                  target="_blank"
                  rel="noreferrer"
                >
                  MaleCNS · Janelia / Cambridge / MRC LMB / Google · CC BY 4.0{" "}
                  <ArrowUpRight size={14} />
                </a>
                <a
                  href="https://github.com/philshiu/Drosophila_brain_model"
                  target="_blank"
                  rel="noreferrer"
                >
                  Shiu et al. · LIF model reference <ArrowUpRight size={14} />
                </a>
                <a
                  href="https://kenney.nl/assets/food-kit"
                  target="_blank"
                  rel="noreferrer"
                >
                  Kenney · Food Kit & Furniture Kit · CC0{" "}
                  <ArrowUpRight size={14} />
                </a>
              </div>
              <p className="dialog-note mono">
                Snapshot:{" "}
                {brain.circuit?.fetched_at?.slice(0, 10) || "2026-09-11"}
                <br />
                SHA256:{" "}
                {brain.circuit?.sha256 || "See backend/data/manifest.json"}
              </p>
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}
