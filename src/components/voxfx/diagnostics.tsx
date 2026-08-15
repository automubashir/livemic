import { useEffect, useState } from "react";

import type { AudioEngine, EngineSnapshot } from "@/lib/audio/engine";

type Props = {
  engine: AudioEngine | null;
  snapshot: EngineSnapshot;
};

/**
 * Collapsed by default. Everything here is read from the live engine, so it is
 * a genuine debugging surface rather than a mirror of the UI's own assumptions.
 */
export function Diagnostics({ engine, snapshot }: Props) {
  const [open, setOpen] = useState(false);
  const [levels, setLevels] = useState({ input: -72, output: -72 });

  useEffect(() => {
    if (!open || !engine) return;
    let last = 0;
    return engine.subscribeLevels((l) => {
      const now = performance.now();
      if (now - last < 120) return;
      last = now;
      setLevels({ input: l.inPeak, output: l.outPeak });
    });
  }, [open, engine]);

  const p = snapshot.micProcessing;
  const applied = snapshot.appliedProcessing;

  return (
    <section className="rounded-lg border border-vx-line bg-vx-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-vx-faint">
          Audio diagnostics
        </span>
        <span className="text-[10px] text-vx-dim">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-0 border-t border-vx-line px-3.5 py-2 sm:grid-cols-2">
          <Row label="AudioContext" value={snapshot.contextState} />
          <Row
            label="Sample rate"
            value={snapshot.sampleRate ? `${(snapshot.sampleRate / 1000).toFixed(1)} kHz` : "—"}
          />
          <Row label="Latency hint" value="interactive" />
          <Row
            label="Base latency"
            value={
              snapshot.baseLatencyMs === null ? "not reported" : `${snapshot.baseLatencyMs} ms`
            }
          />
          <Row
            label="Output latency"
            value={
              snapshot.outputLatencyMs === null ? "not reported" : `${snapshot.outputLatencyMs} ms`
            }
          />
          <Row label="Active mic streams" value={String(snapshot.activeStreams)} />
          <Row label="Active contexts" value={String(snapshot.activeContexts)} />
          <Row
            label="Output route"
            value={
              snapshot.outputRoute === "direct"
                ? "AudioContext destination"
                : "media element (setSinkId)"
            }
          />
          <Row label="Input device" value={snapshot.inputDeviceLabel ?? "—"} />
          <Row label="Output device" value={snapshot.outputDeviceLabel} />
          <Row
            label="Echo cancellation"
            value={describeProcessing(p.echoCancellation, applied.echoCancellation)}
          />
          <Row
            label="Noise suppression"
            value={describeProcessing(p.noiseSuppression, applied.noiseSuppression)}
          />
          <Row
            label="Auto gain control"
            value={describeProcessing(p.autoGainControl, applied.autoGainControl)}
          />
          <Row label="Output limiter" value={snapshot.limiterEnabled ? "on" : "off"} />
          <Row
            label="Preset"
            value={`${snapshot.presetId}${snapshot.presetDirty ? " (edited)" : ""}`}
          />
          <Row
            label="Active effects"
            value={snapshot.dry ? "none — dry signal" : snapshot.activeEffectNames.join(", ")}
          />
          <Row label="Input peak" value={formatDb(levels.input)} />
          <Row label="Output peak" value={formatDb(levels.output)} />
        </dl>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-vx-line/60 py-1.5 last:border-0">
      <dt className="shrink-0 text-[10.5px] text-vx-faint">{label}</dt>
      <dd className="truncate text-[10.5px] tabular-nums text-vx-dim" title={value}>
        {value}
      </dd>
    </div>
  );
}

function describeProcessing(requested: boolean, applied: boolean | undefined): string {
  const req = requested ? "on" : "off";
  if (applied === undefined) return `${req} (requested)`;
  if (applied === requested) return req;
  return `${req} requested · ${applied ? "on" : "off"} applied`;
}

function formatDb(db: number): string {
  return db <= -71 ? "−∞ dB" : `${db.toFixed(1)} dB`;
}
