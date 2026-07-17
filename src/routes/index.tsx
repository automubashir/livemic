import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { VoxFXEngine, defaultParams, presets, type EngineParams } from "@/lib/voxfx-engine";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const engineRef = useRef<VoxFXEngine | null>(null);
  const [running, setRunning] = useState(false);
  const [params, setParams] = useState<EngineParams>(defaultParams);
  const [error, setError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [warned, setWarned] = useState(false);

  useEffect(() => {
    return () => {
      engineRef.current?.stop();
    };
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const engine = engineRef.current ?? new VoxFXEngine();
      engineRef.current = engine;
      engine.update(params);
      await engine.start();
      engine.update(params);
      setLatencyMs(engine.latencyMs);
      setRunning(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Could not start: ${msg}. Grant microphone permission and try again.`);
    }
  }, [params]);

  const stop = useCallback(async () => {
    await engineRef.current?.stop();
    setRunning(false);
  }, []);

  const patch = useCallback((next: Partial<EngineParams>) => {
    setParams((prev) => {
      const merged = { ...prev, ...next };
      engineRef.current?.update(next);
      return merged;
    });
  }, []);

  const applyPreset = (i: number) => {
    const p = presets[i];
    const merged = { ...defaultParams, ...p.params };
    setParams(merged);
    engineRef.current?.update(merged);
  };

  return (
    <div className="min-h-screen bg-[#0b0b12] text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 pt-8 pb-10">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Vox<span className="bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">FX</span>
            </h1>
            <p className="text-xs text-white/50">Live voice effects — mic → speaker</p>
          </div>
          <div className="text-right text-[10px] leading-tight text-white/50">
            {running ? (
              <>
                <div className="text-emerald-400">● LIVE</div>
                <div>~{latencyMs || "?"} ms</div>
              </>
            ) : (
              <div>● idle</div>
            )}
          </div>
        </header>

        {!warned && (
          <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
            <strong className="block text-amber-100">Use headphones or a distant Bluetooth speaker.</strong>
            Playing the mic through the phone's own speaker will cause feedback squeal.
            <button
              onClick={() => setWarned(true)}
              className="mt-2 rounded-md bg-amber-300/20 px-2 py-1 text-[11px] font-medium text-amber-100 hover:bg-amber-300/30"
            >
              Got it
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
            {error}
          </div>
        )}

        <button
          onClick={running ? stop : start}
          className={`mb-6 h-16 w-full rounded-2xl text-lg font-semibold shadow-lg transition ${
            running
              ? "bg-red-500 hover:bg-red-400"
              : "bg-gradient-to-r from-fuchsia-500 to-cyan-400 text-black hover:opacity-90"
          }`}
        >
          {running ? "Stop" : "Start Microphone"}
        </button>

        <section className="mb-6">
          <div className="mb-2 text-xs uppercase tracking-wider text-white/50">Presets</div>
          <div className="grid grid-cols-3 gap-2">
            {presets.map((p, i) => (
              <button
                key={p.name}
                onClick={() => applyPreset(i)}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-xs font-medium hover:bg-white/10"
              >
                {p.name}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <Knob label="Wet / Dry Mix" value={params.wet} min={0} max={1} step={0.01} onChange={(v) => patch({ wet: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Knob label="Reverb" value={params.reverb} min={0} max={1} step={0.01} onChange={(v) => patch({ reverb: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Knob label="Echo Time" value={params.delayTime} min={0} max={1} step={0.005} onChange={(v) => patch({ delayTime: v })} format={(v) => `${Math.round(v * 1000)} ms`} />
          <Knob label="Echo Feedback" value={params.delayFeedback} min={0} max={0.9} step={0.01} onChange={(v) => patch({ delayFeedback: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Knob label="Distortion" value={params.distortion} min={0} max={1} step={0.01} onChange={(v) => patch({ distortion: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Knob label="Low-cut (anti-feedback)" value={params.hpf} min={40} max={600} step={5} onChange={(v) => patch({ hpf: v })} format={(v) => `${Math.round(v)} Hz`} />
          <Knob label="Input Gain" value={params.inputGain} min={0} max={2} step={0.01} onChange={(v) => patch({ inputGain: v })} format={(v) => `${v.toFixed(2)}×`} />
          <Knob label="Output Volume" value={params.outputGain} min={0} max={2} step={0.01} onChange={(v) => patch({ outputGain: v })} format={(v) => `${v.toFixed(2)}×`} />
        </section>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-white/40">
          Output follows your phone's audio route (speaker / Bluetooth / wired).
          Change it from your device's audio menu.
        </p>
      </div>
    </div>
  );
}

function Knob({
  label, value, min, max, step, onChange, format,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format: (v: number) => string;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs text-white/70">{label}</span>
        <span className="text-xs tabular-nums text-white/50">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-fuchsia-400"
      />
    </label>
  );
}
