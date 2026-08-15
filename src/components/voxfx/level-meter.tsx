import { useEffect, useRef } from "react";

import { dbToMeter } from "@/lib/audio/dsp";
import type { AudioEngine, Levels } from "@/lib/audio/engine";

type Props = {
  engine: AudioEngine | null;
  channel: "input" | "output";
  label: string;
};

/**
 * Real RMS/peak meter driven by the engine's AnalyserNodes.
 *
 * Every frame is painted straight to the DOM — no React state — so a 60 Hz
 * meter costs one clip-path write per bar instead of a re-render of the page.
 */
export function LevelMeter({ engine, channel, label }: Props) {
  const fillRef = useRef<HTMLDivElement>(null);
  const peakRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const clipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!engine) return;

    let frame = 0;
    let lastClip: boolean | null = null;

    const paint = (levels: Levels) => {
      const rms = channel === "input" ? levels.inRms : levels.outRms;
      const hold = channel === "input" ? levels.inHold : levels.outHold;
      const peak = channel === "input" ? levels.inPeak : levels.outPeak;
      const clip = channel === "input" ? levels.inClip : levels.outClip;

      const fill = fillRef.current;
      if (fill) fill.style.clipPath = `inset(0 ${(100 - dbToMeter(rms) * 100).toFixed(1)}% 0 0)`;

      const tick = peakRef.current;
      if (tick) {
        const pos = dbToMeter(hold) * 100;
        tick.style.left = `${pos.toFixed(1)}%`;
        tick.style.opacity = pos > 0.5 ? "1" : "0";
      }

      // The numeric readout only needs to be legible, not smooth.
      if (frame++ % 6 === 0 && readoutRef.current) {
        readoutRef.current.textContent = peak <= -71 ? "−∞" : peak.toFixed(1);
      }

      if (clip !== lastClip) {
        lastClip = clip;
        clipRef.current?.classList.toggle("opacity-0", !clip);
      }
    };

    paint(engine.getLevels());
    return engine.subscribeLevels(paint);
  }, [engine, channel]);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-vx-faint">
          {label}
        </span>
        <div className="flex items-center gap-2">
          <span
            ref={clipRef}
            className="rounded-sm bg-vx-live px-1 py-px text-[9px] font-bold tracking-wider text-black opacity-0 transition-opacity"
          >
            CLIP
          </span>
          <span className="text-[10px] tabular-nums text-vx-dim">
            <span ref={readoutRef}>−∞</span>
            <span className="ml-0.5 text-vx-faint">dB</span>
          </span>
        </div>
      </div>

      <div className="relative h-2.5 overflow-hidden rounded-[3px] bg-vx-sunk shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]">
        <div
          ref={fillRef}
          className="absolute inset-0 bg-[linear-gradient(to_right,var(--vx-ok)_0%,var(--vx-ok)_62%,var(--vx-warn)_78%,var(--vx-live)_94%)]"
          style={{ clipPath: "inset(0 100% 0 0)" }}
        />
        <div
          ref={peakRef}
          className="absolute inset-y-0 w-[2px] bg-vx-text/85 opacity-0"
          style={{ left: "0%" }}
        />
        <div className="vx-meter-ticks pointer-events-none absolute inset-0 opacity-70" />
      </div>
    </div>
  );
}
