import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VoxFXEngine, defaultParams, presets, type EngineParams } from "@/lib/voxfx-engine";
import { useWakeLock } from "@/hooks/use-wake-lock";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VoxFX — Live Mic Effects, Reverb & Karaoke Presets" },
      { name: "description", content: "Turn your phone into a live vocal pedal: studio, singing and karaoke presets with reverb, echo and drive, streamed to your speaker or Bluetooth with low latency." },
      { property: "og:title", content: "VoxFX — Live Mic Effects, Reverb & Karaoke Presets" },
      { property: "og:description", content: "Live vocal effects on your phone: singing and karaoke presets, reverb, echo and drive with low-latency monitoring." },
    ],
  }),
  component: Index,
});

function Index() {
  const engineRef = useRef<VoxFXEngine | null>(null);
  const [running, setRunning] = useState(false);
  const [params, setParams] = useState<EngineParams>(defaultParams);
  const [error, setError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [warned, setWarned] = useState(false);
  const [activePreset, setActivePreset] = useState<string>("Clean");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const wakeLock = useWakeLock(running);

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
    setActivePreset(p.name);
    setParams((prev) => {
      // Input gain is a mic-level control and stays independent of presets.
      const merged = { ...defaultParams, ...p.params, inputGain: prev.inputGain, outputGain: prev.outputGain };
      engineRef.current?.update(merged);
      return merged;
    });
  };

  const groups = useMemo(() => {
    const order = ["Speech", "Singing", "Karaoke", "FX"] as const;
    return order.map((g) => ({
      name: g,
      items: presets.map((p, i) => ({ p, i })).filter((x) => x.p.group === g),
    }));
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07070d] text-white">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-fuchsia-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-cyan-500/10 blur-[120px]" />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-5 pt-7 pb-28">
        <header className="mb-5 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Vox<span className="bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">FX</span>
            </h1>
            <p className="mt-0.5 text-xs text-white/45">Live vocal pedal — mic → speaker</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium tracking-wide ${
                running
                  ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30"
                  : "bg-white/5 text-white/45 ring-1 ring-white/10"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${running ? "animate-pulse bg-emerald-400" : "bg-white/40"}`} />
              {running ? `LIVE · ~${latencyMs || "?"} ms` : "IDLE"}
            </span>
            {running && (
              <span className="text-[9px] text-white/35">
                {wakeLock.supported ? (wakeLock.held ? "screen kept awake" : "wake lock pending") : "wake lock unsupported"}
              </span>
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

        {/* Levels — independent of presets */}
        <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">Levels</span>
            <span className="text-[10px] text-white/30">independent of presets</span>
          </div>
          <Knob label="Input Gain (mic)" value={params.inputGain} min={0} max={2} step={0.01} onChange={(v) => patch({ inputGain: v })} format={(v) => `${v.toFixed(2)}×`} />
          <div className="h-4" />
          <Knob label="Output Volume" value={params.outputGain} min={0} max={2} step={0.01} onChange={(v) => patch({ outputGain: v })} format={(v) => `${v.toFixed(2)}×`} />
        </section>

        <section className="mb-5 space-y-5">
          {groups.map((g) => (
            <div key={g.name}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">{g.name}</span>
                <span className="h-px flex-1 bg-white/10" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {g.items.map(({ p, i }) => {
                  const active = activePreset === p.name;
                  return (
                    <button
                      key={p.name}
                      onClick={() => applyPreset(i)}
                      className={`rounded-xl border px-3 py-2.5 text-left transition ${
                        active
                          ? "border-fuchsia-400/50 bg-gradient-to-br from-fuchsia-500/20 to-cyan-400/10 shadow-[0_0_0_1px_rgba(232,121,249,0.25)]"
                          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
                      }`}
                    >
                      <div className={`text-[13px] font-semibold ${active ? "text-white" : "text-white/85"}`}>{p.name}</div>
                      <div className="mt-0.5 text-[10px] leading-tight text-white/40">{p.hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03]">
          <button
            onClick={() => setShowAdvanced((s) => !s)}
            className="flex w-full items-center justify-between px-4 py-3.5"
          >
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">Fine tune</span>
            <span className="text-xs text-white/40">{showAdvanced ? "Hide −" : "Show +"}</span>
          </button>
          {showAdvanced && (
            <div className="space-y-4 border-t border-white/10 px-4 py-4">
              <Knob label="Wet / Dry Mix" value={params.wet} min={0} max={1} step={0.01} onChange={(v) => patch({ wet: v })} format={(v) => `${Math.round(v * 100)}%`} />
              <Knob label="Reverb" value={params.reverb} min={0} max={1} step={0.01} onChange={(v) => patch({ reverb: v })} format={(v) => `${Math.round(v * 100)}%`} />
              <Knob label="Echo Time" value={params.delayTime} min={0} max={1} step={0.005} onChange={(v) => patch({ delayTime: v })} format={(v) => `${Math.round(v * 1000)} ms`} />
              <Knob label="Echo Feedback" value={params.delayFeedback} min={0} max={0.9} step={0.01} onChange={(v) => patch({ delayFeedback: v })} format={(v) => `${Math.round(v * 100)}%`} />
              <Knob label="Distortion" value={params.distortion} min={0} max={1} step={0.01} onChange={(v) => patch({ distortion: v })} format={(v) => `${Math.round(v * 100)}%`} />
              <Knob label="Low-cut (anti-feedback)" value={params.hpf} min={40} max={600} step={5} onChange={(v) => patch({ hpf: v })} format={(v) => `${Math.round(v)} Hz`} />
            </div>
          )}
        </section>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-white/35">
          Output follows your phone's audio route (speaker / Bluetooth / wired).
          Change it from your device's audio menu.
        </p>
      </div>

      {/* Sticky transport */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-white/10 bg-[#07070d]/85 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        <div className="mx-auto max-w-md">
          <button
            onClick={running ? stop : start}
            className={`h-14 w-full rounded-2xl text-base font-semibold tracking-wide shadow-lg transition active:scale-[0.99] ${
              running
                ? "bg-red-500/90 text-white hover:bg-red-500"
                : "bg-gradient-to-r from-fuchsia-500 to-cyan-400 text-black hover:opacity-90"
            }`}
          >
            {running ? "Stop Microphone" : "Start Microphone"}
          </button>
        </div>
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
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs text-white/70">{label}</span>
        <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] tabular-nums text-white/60">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-fuchsia-400"
      />
    </label>
  );
}
