import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { KitchenWorld } from "./world";
import type { Circuit, Options, Telemetry } from "./types";

export function useBrain(
  world: RefObject<KitchenWorld | null>,
  ready: boolean,
  options: Options,
  onEvent: (s: string) => void,
) {
  const [circuit, setCircuit] = useState<Circuit | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "offline">(
    "connecting",
  );
  const [error, setError] = useState("");
  const [history, setHistory] = useState<number[]>([]);
  const latest = useRef(options);
  latest.current = options;
  const event = useRef(onEvent);
  event.current = onEvent;
  const resetPending = useRef(false);
  useEffect(() => {
    if (!ready) return;
    let stopped = false,
      socket: WebSocket | null = null,
      retry: ReturnType<typeof setTimeout> | undefined,
      pending = false,
      lastResponse = Date.now();
    function connect() {
      if (stopped) return;
      setStatus("connecting");
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/simulation`,
      );
      socket.onmessage = (e) => {
        if (stopped) return;
        const data = JSON.parse(e.data);
        lastResponse = Date.now();
        pending = false;
        if (data.type === "connected") {
          setCircuit(data);
          setError("");
          setStatus("live");
          event.current(
            "MaleCNS circuit connected · independent neural session",
          );
          if (world.current) world.current.connected = true;
        }
        if (data.type === "telemetry") {
          setTelemetry(data);
          setStatus("live");
          setError("");
          if (world.current) {
            world.current.connected = true;
            world.current.motor = data.motor;
          }
          if (latest.current.running)
            setHistory((h) => [...h.slice(-69), data.mean_hz]);
        }
        if (data.type === "error") {
          setError(data.message);
          event.current(data.message);
        }
      };
      socket.onclose = () => {
        if (stopped) return;
        setStatus("offline");
        pending = false;
        if (world.current) {
          world.current.connected = false;
          world.current.motor = { forward: 0, turn: 0, lift: 0, feeding: 0 };
        }
        retry = setTimeout(connect, 2500);
      };
      socket.onerror = () => {
        setError("Neural service unavailable. Retrying automatically.");
        socket?.close();
      };
    }
    connect();
    const timer = setInterval(() => {
      if (stopped) return;
      if (pending && Date.now() - lastResponse > 4000) {
        socket?.close();
        return;
      }
      if (socket?.readyState === WebSocket.OPEN && !pending && world.current) {
        pending = true;
        const o = latest.current;
        socket.send(
          JSON.stringify({
            sensors: world.current.sensors,
            running: o.running,
            silenced: o.silenced,
            gain: o.gain,
            command: resetPending.current ? "reset" : "step",
          }),
        );
        resetPending.current = false;
      }
    }, 100);
    return () => {
      stopped = true;
      clearInterval(timer);
      clearTimeout(retry);
      socket?.close();
      if (world.current) world.current.connected = false;
    };
  }, [ready, world]);
  return {
    circuit,
    telemetry,
    status,
    error,
    history,
    reset: () => {
      resetPending.current = true;
      setHistory([]);
      setTelemetry(null);
    },
  };
}
