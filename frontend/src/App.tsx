import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Bug,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
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
  Snowflake,
  Square,
  Sun,
  Thermometer,
  Trash2,
  Video,
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
  flies: [
    { id: 1, color: "#c6eaa0", x: -1.6, y: 1.7, z: 1.15 },
    { id: 2, color: "#77c9ff", x: 2.4, y: 2.3, z: -0.5 },
  ],
  selectedFly: 1,
  elapsed: 0,
  speed: 0,
  altitude: 1.7,
  energy: 92,
  stomach: 76,
  temperature: 24,
  light: 0.8,
  odor: 0,
  behavior: "Connecting",
  x: -1.6,
  z: 1.15,
  fps: 0,
  distance: 0,
  foods: defaultFoods(),
  hour: 10.5,
};
const num = (value: number) => new Intl.NumberFormat("en-US").format(value);
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
  const [tab, setTab] = useState<"controls" | "environment" | "brain">(
    "controls",
  );
  const [minimized, setMinimized] = useState(
    () => window.matchMedia("(max-width: 800px)").matches,
  );
  const [circuitView, setCircuitView] = useState(false);
  const [toast, setToast] = useState("");
  const [recording, setRecording] = useState(false),
    [saving, setSaving] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const world = useRef<KitchenWorld | null>(null),
    container = useRef<HTMLDivElement>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const onEvent = useCallback((message: string) => setToast(message), []);
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
      (patch) => setOptions((o) => ({ ...o, ...patch })),
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
      if (recorder.current) {
        recorder.current.onstop = null;
        if (recorder.current.state !== "inactive") recorder.current.stop();
        recorder.current.stream.getTracks().forEach((t) => t.stop());
      }
      world.current?.dispose();
      world.current = null;
    };
  }, [onEvent]);
  useEffect(() => {
    if (world.current) world.current.renderVisible = !circuitView;
  }, [circuitView, ready]);
  useEffect(() => {
    world.current?.setOptions(options);
  }, [options]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === "Escape") setOptions((o) => ({ ...o, placing: null }));
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
      const camera = (
        {
          Digit1: "orbit",
          Digit2: "follow",
          Digit3: "eyes",
        } as Record<string, CameraMode>
      )[e.code];
      if (camera) setOptions((o) => ({ ...o, camera }));
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
  const record = () => {
    if (recorder.current?.state === "recording") {
      setSaving(true);
      recorder.current.stop();
      return;
    }
    let stream: MediaStream | undefined;
    try {
      if (!world.current || typeof MediaRecorder === "undefined")
        throw Error("Video recording is unavailable in this browser.");
      stream = world.current.captureStream();
      const mime = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
        "video/mp4",
      ].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      const chunks: Blob[] = [];
      let failed = false;
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onerror = () => {
        failed = true;
        setRecording(false);
        setSaving(false);
        stream?.getTracks().forEach((t) => t.stop());
        onEvent("Video recording failed. Please try again.");
      };
      rec.onstop = () => {
        rec.stream.getTracks().forEach((t) => t.stop());
        recorder.current = null;
        setRecording(false);
        setSaving(false);
        if (failed || !chunks.length) {
          if (!failed)
            onEvent("No video frames recorded. Try a longer recording.");
          return;
        }
        const blob = new Blob(chunks, { type: rec.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `fly-matrix-${Date.now()}.${rec.mimeType.includes("mp4") ? "mp4" : "webm"}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        onEvent("Video saved");
      };
      rec.start(1000);
      recorder.current = rec;
      setRecording(true);
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop());
      setRecording(false);
      setSaving(false);
      onEvent(e instanceof Error ? e.message : "Video recording unavailable");
    }
  };
  return (
    <div className="app matrix-app">
      <header className="matrix-header">
        <a className="brand" href="/" aria-label="Fly Matrix home">
          <span className="brand-icon">
            <Bug size={24} />
          </span>
          <span>
            Fly <span className="brand-light">Matrix</span>
          </span>
        </a>
        <div className="matrix-status" title={`Neural service ${brain.status}`}>
          <span className={`status-dot ${brain.status}`} />
          <span>
            {brain.status === "live"
              ? "Connected"
              : brain.status === "connecting"
                ? "Connecting"
                : "Offline"}
          </span>
        </div>
      </header>
      <main className="matrix-workspace">
        <div className="matrix-scene" data-testid="viewport">
          <div ref={container} className="canvas-host" />
          {!ready && (
            <div className="loading-scene">
              {loadError || "Preparing habitat…"}
            </div>
          )}
          {options.placing && (
            <div className="placement-banner">
              Place {options.placing}
              <button
                aria-label="Cancel placement"
                onClick={() => set("placing", null)}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {circuitView && (
            <div className="matrix-network">
              <button
                className="icon-button network-close"
                aria-label="Close neural circuit"
                onClick={() => setCircuitView(false)}
              >
                <X />
              </button>
              <Network telemetry={brain.telemetry} />
            </div>
          )}
          <div className="scene-foot">
            <span>
              {ready ? "Habitat ready" : "Loading habitat"} · {stats.fps} FPS
            </span>
            <span className="camera-hint">
              {
                {
                  orbit: "Orbit",
                  follow: `Following fly ${stats.selectedFly}`,
                  eyes: `Fly ${stats.selectedFly} eye`,
                }[options.camera]
              }
            </span>
          </div>
        </div>
        <aside className="fly-panel" aria-label="Flies">
          <div className="fly-panel-title">
            <Bug size={16} />
            <span>Flies</span>
            <small>{stats.flies.length}</small>
          </div>
          <div className="fly-list">
            {stats.flies.map((f) => (
              <div className="fly-entry" key={f.id}>
                <button
                  className={`fly-item ${stats.selectedFly === f.id ? "selected" : ""}`}
                  aria-label={`Select fly ${f.id}`}
                  aria-pressed={stats.selectedFly === f.id}
                  title={`Fly ${f.id}`}
                  onClick={() => world.current?.selectFly(f.id)}
                >
                  <Bug size={19} style={{ color: f.color }} />
                  <span>{String(f.id).padStart(2, "0")}</span>
                  {stats.selectedFly === f.id && (
                    <span
                      className="fly-selected-dot"
                      style={{ background: f.color }}
                    />
                  )}
                </button>
                {stats.selectedFly === f.id && (
                  <div className="fly-stats" aria-label={`Fly ${f.id} stats`}>
                    <div className="matrix-metrics">
                      {[
                        ["Speed", stats.speed.toFixed(2), "m/s"],
                        ["Height", stats.altitude.toFixed(2), "m"],
                        ["Energy", Math.round(stats.energy), "%"],
                        ["Hunger", Math.round(100 - stats.stomach), "%"],
                      ].map(([label, value, unit]) => (
                        <div
                          className="metric"
                          key={label}
                          title={
                            label === "Hunger"
                              ? "Seeks food at 10% hunger and eats until nearly full."
                              : undefined
                          }
                        >
                          <span>{label}</span>
                          <strong>
                            {value} <small>{unit}</small>
                          </strong>
                        </div>
                      ))}
                    </div>
                    <div className="setting-row">
                      <span>
                        <Activity size={14} /> Flight trail
                      </span>
                      <Toggle
                        label="Flight trail"
                        checked={options.trail}
                        onChange={() => set("trail", !options.trail)}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            className="add-fly"
            aria-label="Add fly"
            title="Add fly"
            disabled={!ready || stats.flies.length >= 12}
            onClick={() => world.current?.addFly()}
          >
            <Plus size={17} />
            <span>Add fly</span>
          </button>
        </aside>
        <aside
          className={`unified-panel ${minimized ? "minimized" : ""}`}
          aria-label="Settings"
        >
          <div className="unified-heading">
            {!minimized && (
              <span>
                <Settings2 size={16} /> Controls
              </span>
            )}
            <button
              className="icon-button"
              aria-label={minimized ? "Expand settings" : "Minimize settings"}
              title={minimized ? "Expand settings" : "Minimize settings"}
              aria-expanded={!minimized}
              onClick={() => setMinimized(!minimized)}
            >
              {minimized ? (
                <ChevronLeft size={18} />
              ) : (
                <ChevronRight size={18} />
              )}
            </button>
          </div>
          {!minimized && (
            <>
              <div
                className="panel-tabs"
                role="tablist"
                aria-label="Settings tabs"
              >
                {(
                  [
                    ["controls", "Simulation", Play],
                    ["environment", "Environment", Leaf],
                    ["brain", "Brain", NetworkIcon],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    role="tab"
                    id={`tab-${key}`}
                    aria-controls={`panel-${key}`}
                    aria-selected={tab === key}
                    title={label}
                    key={key}
                    className={tab === key ? "selected" : ""}
                    onClick={() => setTab(key)}
                  >
                    <Icon size={17} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <div
                className="unified-content"
                role="tabpanel"
                id={`panel-${tab}`}
                aria-labelledby={`tab-${tab}`}
              >
                {tab === "controls" && (
                  <>
                    <section className="matrix-section">
                      <div className="playback-row">
                        <button
                          className="play-button"
                          disabled={!ready}
                          aria-label={
                            options.running
                              ? "Pause simulation"
                              : "Resume simulation"
                          }
                          onClick={() => set("running", !options.running)}
                        >
                          {options.running ? (
                            <Pause size={16} />
                          ) : (
                            <Play size={16} />
                          )}
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Reset experiment"
                          title="Reset"
                          onClick={reset}
                        >
                          <RotateCcw size={16} />
                        </button>
                      </div>
                      <div className="speed-select">
                        {[0.5, 1, 2].map((n) => (
                          <button
                            key={n}
                            aria-label={`${n}× speed`}
                            aria-pressed={options.speed === n}
                            className={options.speed === n ? "selected" : ""}
                            onClick={() => set("speed", n)}
                          >
                            {n}×
                          </button>
                        ))}
                      </div>
                    </section>
                    <section className="matrix-section">
                      <h3>
                        <Camera size={15} /> Camera
                      </h3>
                      <div className="camera-grid">
                        {(
                          [
                            ["orbit", "Orbit", MousePointer2],
                            ["follow", "Follow", Focus],
                            ["eyes", "Fly eye", Eye],
                          ] as const
                        ).map(([mode, label, Icon]) => (
                          <button
                            key={mode}
                            title={`${label} camera`}
                            aria-label={`${label} camera`}
                            aria-pressed={options.camera === mode}
                            className={
                              options.camera === mode ? "selected" : ""
                            }
                            onClick={() => set("camera", mode)}
                          >
                            <Icon size={18} />
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                    </section>

                    <section className="matrix-section">
                      <button
                        className={`record-button ${recording ? "recording" : ""}`}
                        disabled={!ready || saving}
                        onClick={record}
                      >
                        {recording ? <Square size={16} /> : <Video size={17} />}{" "}
                        {saving
                          ? "Saving…"
                          : recording
                            ? "Stop & save video"
                            : "Record video"}
                      </button>
                      <button
                        className="fullscreen-button"
                        onClick={() => {
                          if (document.fullscreenElement)
                            void document.exitFullscreen();
                          else
                            void document
                              .querySelector(".matrix-app")
                              ?.requestFullscreen()
                              .catch(() => onEvent("Fullscreen unavailable"));
                        }}
                      >
                        <Maximize2 size={14} /> Fullscreen
                      </button>
                    </section>
                  </>
                )}
                {tab === "environment" && (
                  <>
                    <section className="matrix-section">
                      <h3>
                        <Sun size={15} /> Light{" "}
                        <span className="weather-chip">
                          {hour(options.hour)}
                        </span>
                      </h3>
                      <input
                        aria-label="Time of day"
                        type="range"
                        min="0"
                        max="23.99"
                        step=".1"
                        value={options.hour}
                        onChange={(e) => set("hour", +e.target.value)}
                      />
                      <div className="setting-row">
                        <span>Day / night</span>
                        <Toggle
                          label="Day night cycle"
                          checked={options.cycle}
                          onChange={() => set("cycle", !options.cycle)}
                        />
                      </div>
                      <label className="slider-label">
                        Sunlight{" "}
                        <span>{Math.round(options.sunlight * 100)}%</span>
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
                    </section>
                    <section className="matrix-section">
                      <label className="slider-label">
                        <span>
                          <Thermometer size={14} /> Temperature
                        </span>
                        <span>{options.temperature}°C</span>
                      </label>
                      <input
                        aria-label="Room temperature"
                        type="range"
                        min="10"
                        max="40"
                        value={options.temperature}
                        onChange={(e) => set("temperature", +e.target.value)}
                      />
                      <div className="appliance-grid">
                        {(
                          [
                            ["lamp", "Kitchen light", Lightbulb],
                            ["stove", "Stovetop heat", Flame],
                            ["fridge", "Fridge open", Snowflake],
                            ["windowOpen", "Open window", Wind],
                          ] as const
                        ).map(([key, label, Icon]) => (
                          <button
                            key={key}
                            role="switch"
                            aria-label={label}
                            aria-checked={options[key]}
                            title={label}
                            className={options[key] ? "selected" : ""}
                            onClick={() => set(key, !options[key])}
                          >
                            <Icon size={21} />
                            <small>
                              {key === "lamp" || key === "stove"
                                ? options[key]
                                  ? "On"
                                  : "Off"
                                : options[key]
                                  ? "Open"
                                  : "Closed"}
                            </small>
                          </button>
                        ))}
                      </div>
                    </section>
                    <section className="matrix-section">
                      <h3>
                        <Leaf size={15} /> Food{" "}
                        <small>{stats.foods.length}/12</small>
                      </h3>
                      <div className="food-choices">
                        {(
                          ["banana", "apple", "bread", "cheese"] as FoodKind[]
                        ).map((k) => (
                          <button
                            key={k}
                            aria-label={`Add ${foodNames[k]}`}
                            title={`Add ${foodNames[k]}`}
                            disabled={!ready || stats.foods.length >= 12}
                            className={options.placing === k ? "selected" : ""}
                            onClick={() => {
                              set("placing", k);
                              setCircuitView(false);
                            }}
                          >
                            <img src={`/food-${k}.svg`} alt="" />
                            <Plus size={11} />
                          </button>
                        ))}
                      </div>
                      <div className="food-list">
                        {stats.foods.map((f) => (
                          <div className="food-row" key={f.id}>
                            <img src={`/food-${f.kind}.svg`} alt="" />
                            <span>
                              {foodNames[f.kind]}
                              <small className="food-freshness">
                                {f.freshness > 0.85
                                  ? "Fresh"
                                  : f.freshness > 0.45
                                    ? "Ripening"
                                    : "Rotting"}{" "}
                                · {Math.round(f.remaining * 100)}%
                              </small>
                            </span>
                            <button
                              className="icon-button"
                              aria-label={`Remove ${foodNames[f.kind]} ${f.id}`}
                              onClick={() => world.current?.removeFood(f.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>
                    <section className="matrix-section">
                      <h3>
                        <Eye size={15} /> Fields
                      </h3>
                      <div className="overlay-grid">
                        {(
                          [
                            ["none", "Natural", Eye],
                            ["odor", "Odor", Wind],
                            ["thermal", "Thermal", Thermometer],
                            ["light", "Light", Sun],
                          ] as const
                        ).map(([key, label, Icon]) => (
                          <button
                            key={key}
                            aria-label={label}
                            title={label}
                            className={
                              options.overlay === key ? "selected" : ""
                            }
                            onClick={() => set("overlay", key as Overlay)}
                          >
                            <Icon size={16} />
                            {label}
                          </button>
                        ))}
                      </div>
                    </section>
                  </>
                )}
                {tab === "brain" && (
                  <>
                    <section className="matrix-section">
                      <div className="model-badge">
                        <span className={`status-dot ${brain.status}`} />{" "}
                        MaleCNS v1.0
                      </div>
                      <div className="neuron-counts">
                        <div>
                          <strong>
                            {brain.circuit ? num(brain.circuit.neurons) : "—"}
                          </strong>
                          <span>neurons</span>
                        </div>
                        <div>
                          <strong>
                            {brain.circuit
                              ? (brain.circuit.synapses / 1e6).toFixed(2)
                              : "—"}
                            M
                          </strong>
                          <span>synapses</span>
                        </div>
                      </div>
                      <p className="compact-note">
                        Fly {stats.selectedFly} input · shared circuit
                      </p>
                    </section>
                    <section className="matrix-section">
                      <h3>
                        <Activity size={15} /> Activity
                      </h3>
                      <div className="activity-value">
                        {brain.telemetry?.mean_hz.toFixed(1) || "0.0"}
                        <span> Hz</span>
                      </div>
                      <Sparkline values={brain.history} />
                      <div className="chart-legend">
                        <span>{brain.history.length} samples</span>
                        <span>
                          {brain.telemetry?.active_neurons || 0} firing
                        </span>
                      </div>
                      <div className="motor-columns">
                        <div>
                          <span>Left DNs</span>
                          <strong>
                            {brain.telemetry?.motor_left_hz.toFixed(1) || "0.0"}{" "}
                            Hz
                          </strong>
                        </div>
                        <div>
                          <span>Right DNs</span>
                          <strong>
                            {brain.telemetry?.motor_right_hz.toFixed(1) ||
                              "0.0"}{" "}
                            Hz
                          </strong>
                        </div>
                      </div>
                    </section>
                    <section className="matrix-section interventions">
                      <div className="setting-row">
                        <span>
                          <Zap size={14} /> Silence neurons
                        </span>
                        <Toggle
                          label="Silence all neurons"
                          checked={options.silenced}
                          onChange={() => set("silenced", !options.silenced)}
                        />
                      </div>
                      <label className="slider-label">
                        Sensory gain <span>{options.gain.toFixed(1)}×</span>
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
                    <section className="matrix-section">
                      <button
                        className="record-button"
                        onClick={() => setCircuitView(!circuitView)}
                      >
                        <NetworkIcon size={16} /> Neural circuit
                      </button>
                    </section>
                    {brain.error && (
                      <p className="service-error" role="alert">
                        {brain.error}
                      </p>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </aside>
      </main>
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
    </div>
  );
}
