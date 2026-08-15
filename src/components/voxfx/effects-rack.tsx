import { useEffect, useState, type ReactNode } from "react";

import { Fader } from "./fader";
import { PARAM_RANGES, isFlatEq, type EffectParams } from "@/lib/audio/params";

type Props = {
  params: EffectParams;
  dry: boolean;
  onChange: <K extends keyof EffectParams>(key: K, value: number) => void;
  onToggleBypass: () => void;
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const ms = (v: number) => `${Math.round(v * 1000)} ms`;
const hz = (v: number) => `${Math.round(v)} Hz`;
const db = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`;

export function EffectsRack({ params, dry, onChange, onToggleBypass }: Props) {
  const bypassed = params.wet <= 0;

  return (
    <section className="rounded-lg border border-vx-line bg-vx-panel">
      <div className="flex items-center justify-between gap-3 border-b border-vx-line px-3.5 py-2.5">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-vx-faint">
          Effects
        </h2>
        <button
          type="button"
          onClick={onToggleBypass}
          aria-pressed={bypassed}
          className={`rounded px-2 py-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] transition-colors ${
            bypassed
              ? "bg-vx-ok/15 text-vx-ok ring-1 ring-inset ring-vx-ok/30"
              : "bg-vx-sunk text-vx-dim ring-1 ring-inset ring-vx-line-strong hover:text-vx-text"
          }`}
        >
          {bypassed ? "FX bypassed" : "Bypass FX"}
        </button>
      </div>

      <div className="divide-y divide-vx-line">
        <div className="px-3.5 py-3">
          <Fader
            label="Effect amount"
            value={params.wet}
            {...PARAM_RANGES.wet}
            onChange={(v) => onChange("wet", v)}
            format={(v) => (v <= 0 ? "bypassed" : pct(v))}
            hint={
              dry
                ? "No effect signal is reaching the output — the FX branch is disconnected."
                : undefined
            }
          />
        </div>

        <FxSection title="Reverb" amount={params.reverbMix} disabled={bypassed}>
          <Fader
            label="Level"
            value={params.reverbMix}
            {...PARAM_RANGES.reverbMix}
            onChange={(v) => onChange("reverbMix", v)}
            format={(v) => (v <= 0 ? "off" : pct(v))}
          />
          <Fader
            label="Size"
            value={params.reverbSize}
            {...PARAM_RANGES.reverbSize}
            onChange={(v) => onChange("reverbSize", v)}
            format={pct}
          />
          <Fader
            label="Decay"
            value={params.reverbDecay}
            {...PARAM_RANGES.reverbDecay}
            onChange={(v) => onChange("reverbDecay", v)}
            format={pct}
          />
          <Fader
            label="Damping"
            value={params.reverbDamp}
            {...PARAM_RANGES.reverbDamp}
            onChange={(v) => onChange("reverbDamp", v)}
            format={pct}
          />
        </FxSection>

        <FxSection title="Echo / Delay" amount={params.delayMix} disabled={bypassed}>
          <Fader
            label="Level"
            value={params.delayMix}
            {...PARAM_RANGES.delayMix}
            onChange={(v) => onChange("delayMix", v)}
            format={(v) => (v <= 0 ? "off" : pct(v))}
          />
          <Fader
            label="Time"
            value={params.delayTime}
            {...PARAM_RANGES.delayTime}
            onChange={(v) => onChange("delayTime", v)}
            format={ms}
          />
          <Fader
            label="Feedback"
            value={params.delayFeedback}
            {...PARAM_RANGES.delayFeedback}
            onChange={(v) => onChange("delayFeedback", v)}
            format={pct}
          />
          <Fader
            label="Repeat damping"
            value={params.delayDamp}
            {...PARAM_RANGES.delayDamp}
            onChange={(v) => onChange("delayDamp", v)}
            format={pct}
          />
        </FxSection>

        <FxSection title="Modulation" amount={params.chorusMix} disabled={bypassed}>
          <Fader
            label="Chorus level"
            value={params.chorusMix}
            {...PARAM_RANGES.chorusMix}
            onChange={(v) => onChange("chorusMix", v)}
            format={(v) => (v <= 0 ? "off" : pct(v))}
          />
          <Fader
            label="Rate"
            value={params.chorusRate}
            {...PARAM_RANGES.chorusRate}
            onChange={(v) => onChange("chorusRate", v)}
            format={(v) => `${v.toFixed(1)} Hz`}
          />
          <Fader
            label="Depth"
            value={params.chorusDepth}
            {...PARAM_RANGES.chorusDepth}
            onChange={(v) => onChange("chorusDepth", v)}
            format={pct}
          />
        </FxSection>

        <FxSection title="Character" amount={params.drive} disabled={bypassed}>
          <Fader
            label="Drive"
            value={params.drive}
            {...PARAM_RANGES.drive}
            onChange={(v) => onChange("drive", v)}
            format={(v) => (v <= 0 ? "clean" : pct(v))}
            hint="Level-compensated soft saturation."
          />
        </FxSection>

        <FxSection
          title="Voice / EQ"
          amount={isFlatEq(params) ? 0 : 1}
          litLabel={isFlatEq(params) ? "flat" : "shaped"}
          defaultOpen={false}
        >
          <Fader
            label="Low cut"
            value={params.lowCut}
            {...PARAM_RANGES.lowCut}
            onChange={(v) => onChange("lowCut", v)}
            format={hz}
            hint="Removes rumble and reduces low-frequency feedback."
          />
          <Fader
            label="Low"
            value={params.eqLow}
            {...PARAM_RANGES.eqLow}
            onChange={(v) => onChange("eqLow", v)}
            format={db}
            resetTo={0}
          />
          <Fader
            label="Mid"
            value={params.eqMid}
            {...PARAM_RANGES.eqMid}
            onChange={(v) => onChange("eqMid", v)}
            format={db}
            resetTo={0}
          />
          <Fader
            label="Mid frequency"
            value={params.eqMidFreq}
            {...PARAM_RANGES.eqMidFreq}
            onChange={(v) => onChange("eqMidFreq", v)}
            format={hz}
          />
          <Fader
            label="High"
            value={params.eqHigh}
            {...PARAM_RANGES.eqHigh}
            onChange={(v) => onChange("eqHigh", v)}
            format={db}
            resetTo={0}
          />
        </FxSection>
      </div>
    </section>
  );
}

/**
 * Sections open themselves when the preset actually uses that effect, so the
 * visible controls track the selected sound instead of showing a wall of
 * faders that do nothing.
 */
function FxSection({
  title,
  amount,
  children,
  disabled,
  litLabel,
  defaultOpen,
}: {
  title: string;
  amount: number;
  children: ReactNode;
  disabled?: boolean;
  litLabel?: string;
  defaultOpen?: boolean;
}) {
  const lit = amount > 0;
  const [open, setOpen] = useState(defaultOpen ?? lit);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!pinned) setOpen(defaultOpen ?? lit);
  }, [lit, pinned, defaultOpen]);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setPinned(true);
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full transition-colors ${
            lit && !disabled ? "bg-vx-accent" : "bg-vx-faint/40"
          }`}
        />
        <span
          className={`flex-1 text-[11px] font-medium ${lit && !disabled ? "text-vx-text" : "text-vx-dim"}`}
        >
          {title}
        </span>
        <span className="text-[10px] tabular-nums text-vx-faint">
          {litLabel ?? (lit ? pct(amount) : "off")}
        </span>
        <span className="text-[10px] text-vx-faint">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div
          className={`space-y-3 px-3.5 pb-3.5 ${disabled ? "pointer-events-none opacity-45" : ""}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
