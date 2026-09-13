export type CameraMode = "orbit" | "follow" | "eyes";
export type Overlay = "none" | "odor" | "thermal" | "light";
export type FoodKind = "banana" | "apple" | "bread" | "cheese";
export interface Food {
  id: number;
  kind: FoodKind;
  x: number;
  y: number;
  z: number;
  remaining: number;
  freshness: number;
  meals: number;
}
export interface Options {
  running: boolean;
  camera: CameraMode;
  hour: number;
  cycle: boolean;
  temperature: number;
  sunlight: number;
  stove: boolean;
  fridge: boolean;
  lamp: boolean;
  windowOpen: boolean;
  overlay: Overlay;
  speed: number;
  gain: number;
  silenced: boolean;
  placing: FoodKind | null;
  trail: boolean;
}
export interface Sensors {
  odor_left: number;
  odor_right: number;
  light_left: number;
  light_right: number;
  heat: number;
  cold: number;
  taste: number;
}
export interface Motor {
  forward: number;
  turn: number;
  lift: number;
  feeding: number;
}
export interface Telemetry {
  type: "telemetry";
  neural_ms: number;
  spikes: number;
  active_neurons: number;
  mean_hz: number;
  compute_ms: number;
  motor_left_hz: number;
  motor_right_hz: number;
  motor: Motor;
  groups: Record<string, number>;
  activity: { id: string; type: string; hz: number; side: string }[];
  silenced: boolean;
}
export interface Circuit {
  dataset: string;
  neurons: number;
  edges: number;
  synapses: number;
  descending_neurons: number;
  groups: Record<string, number>;
  fetched_at: string;
  sha256: string;
  excluded_transmitter_neurons: number;
  selection: string;
  fidelity: string;
}
export interface FlyInfo {
  id: number;
  color: string;
  x: number;
  y: number;
  z: number;
}
export interface WorldStats {
  flies: FlyInfo[];
  selectedFly: number;
  elapsed: number;
  speed: number;
  altitude: number;
  energy: number;
  stomach: number;
  temperature: number;
  light: number;
  odor: number;
  behavior: string;
  x: number;
  z: number;
  fps: number;
  distance: number;
  foods: Food[];
  hour: number;
}
export const initialOptions: Options = {
  running: true,
  camera: "orbit",
  hour: 10.5,
  cycle: false,
  temperature: 24,
  sunlight: 0.8,
  stove: true,
  fridge: true,
  lamp: false,
  windowOpen: true,
  overlay: "none",
  speed: 1,
  gain: 1,
  silenced: false,
  placing: null,
  trail: true,
};
export const defaultFoods = (): Food[] => [
  {
    id: 1,
    kind: "banana",
    x: -0.8,
    y: 1.25,
    z: 0.5,
    remaining: 1,
    freshness: 1,
    meals: 0,
  },
  {
    id: 2,
    kind: "apple",
    x: 0.5,
    y: 1.25,
    z: 0.6,
    remaining: 1,
    freshness: 1,
    meals: 0,
  },
  {
    id: 3,
    kind: "bread",
    x: 1.1,
    y: 1.25,
    z: 0.35,
    remaining: 1,
    freshness: 1,
    meals: 0,
  },
];
export const foodNames: Record<FoodKind, string> = {
  banana: "Ripe banana",
  apple: "Fresh apple",
  bread: "Sourdough",
  cheese: "Aged cheese",
};
