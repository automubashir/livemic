import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import {
  INITIAL_SNAPSHOT,
  getEngine,
  type AudioEngine,
  type EngineSnapshot,
  type MicProcessing,
} from "@/lib/audio/engine";
import type { EffectParams } from "@/lib/audio/params";
import type { Preset } from "@/lib/audio/presets";

const noopSubscribe = () => () => {};
const serverSnapshot = () => INITIAL_SNAPSHOT;

/**
 * Binds the single page-wide AudioEngine to React.
 *
 * The engine is the source of truth. React never holds audio state that could
 * drift from the graph, and no render or effect ever constructs audio nodes —
 * which is what keeps StrictMode's double-invoke from duplicating anything.
 */
export function useVoxFX() {
  const engine = useMemo(() => getEngine(), []);

  const snapshot = useSyncExternalStore<EngineSnapshot>(
    engine?.subscribe ?? noopSubscribe,
    engine?.getSnapshot ?? serverSnapshot,
    serverSnapshot,
  );

  useEffect(() => {
    engine?.init();
    return () => {
      // Release the microphone if this view goes away, but keep the context and
      // graph alive so a remount reuses them instead of building a second one.
      void engine?.stop();
    };
  }, [engine]);

  const start = useCallback(() => engine?.start() ?? Promise.resolve(), [engine]);
  const stop = useCallback(() => engine?.stop() ?? Promise.resolve(), [engine]);
  const toggle = useCallback(() => {
    if (!engine) return Promise.resolve();
    return engine.getSnapshot().status === "live" ? engine.stop() : engine.start();
  }, [engine]);

  const setParam = useCallback(
    <K extends keyof EffectParams>(key: K, value: number) => engine?.setParam(key, value),
    [engine],
  );
  const selectPreset = useCallback((preset: Preset) => engine?.selectPreset(preset), [engine]);
  const toggleFxBypass = useCallback(() => engine?.toggleFxBypass(), [engine]);
  const setMuted = useCallback((muted: boolean) => engine?.setMuted(muted), [engine]);
  const setLimiterEnabled = useCallback((on: boolean) => engine?.setLimiterEnabled(on), [engine]);
  const setMicProcessing = useCallback(
    (next: Partial<MicProcessing>) => engine?.setMicProcessing(next),
    [engine],
  );
  const setInputDevice = useCallback((id: string | null) => engine?.setInputDevice(id), [engine]);
  const setOutputDevice = useCallback((id: string | null) => engine?.setOutputDevice(id), [engine]);
  const clearError = useCallback(() => engine?.clearError(), [engine]);

  return {
    engine: engine as AudioEngine | null,
    snapshot,
    start,
    stop,
    toggle,
    setParam,
    selectPreset,
    toggleFxBypass,
    setMuted,
    setLimiterEnabled,
    setMicProcessing,
    setInputDevice,
    setOutputDevice,
    clearError,
  };
}
