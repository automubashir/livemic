// The complete, declarative description of an engine state.
//
// Every preset is a plain value of this shape — there is no per-preset code and
// no per-preset graph. The engine owns one graph for the whole session and only
// ever writes AudioParams (and swaps impulse buffers) when params change.

export type EffectParams = {
  /** Mic trim, linear. 0..2 */
  inputGain: number;
  /** Master monitor level, linear. 0..2 */
  outputGain: number;

  /** Master effect send. 0 means literally no signal enters the FX branch. */
  wet: number;

  // ── Tone / EQ (always on the direct path) ──
  /** Highpass corner in Hz. 20 is effectively transparent. */
  lowCut: number;
  /** Low shelf @ 180 Hz, dB. */
  eqLow: number;
  /** Peaking mid, dB. */
  eqMid: number;
  /** Peaking mid centre, Hz. */
  eqMidFreq: number;
  /** High shelf @ 6 kHz, dB. */
  eqHigh: number;

  // ── Character ──
  /** Soft saturation. 0..1 */
  drive: number;

  // ── Reverb send ──
  /** Reverb return level. 0 = reverb contributes nothing. 0..1 */
  reverbMix: number;
  /** Room size (impulse length). 0..1 */
  reverbSize: number;
  /** Tail sustain within the room. 0..1 */
  reverbDecay: number;
  /** High-frequency absorption. 0..1 */
  reverbDamp: number;

  // ── Delay / echo send ──
  /** Echo return level. 0 = no echo at all. 0..1 */
  delayMix: number;
  /** Echo time in seconds. 0..1 */
  delayTime: number;
  /** Repeats. 0..0.85 (hard-capped by the engine). */
  delayFeedback: number;
  /** Repeat darkening. 0..1 */
  delayDamp: number;

  // ── Modulation / chorus send ──
  /** Chorus return level. 0 = no modulation. 0..1 */
  chorusMix: number;
  /** LFO speed in Hz. */
  chorusRate: number;
  /** LFO excursion. 0..1 */
  chorusDepth: number;
};

/**
 * The reference dry state. Every effect return is zero, so a preset that omits
 * a key gets silence from that effect rather than an inherited leftover — this
 * is what makes "dry" structurally guaranteed instead of a slider convention.
 */
export const DRY_PARAMS: EffectParams = {
  inputGain: 1,
  outputGain: 1,
  wet: 0,
  lowCut: 75,
  eqLow: 0,
  eqMid: 0,
  eqMidFreq: 1800,
  eqHigh: 0,
  drive: 0,
  reverbMix: 0,
  reverbSize: 0.3,
  reverbDecay: 0.5,
  reverbDamp: 0.4,
  delayMix: 0,
  delayTime: 0.2,
  delayFeedback: 0,
  delayDamp: 0.5,
  chorusMix: 0,
  chorusRate: 0.8,
  chorusDepth: 0.3,
};

/** Params a preset is allowed to define — levels stay under user control. */
export type PresetParams = Omit<Partial<EffectParams>, "inputGain" | "outputGain">;

export const PARAM_RANGES = {
  inputGain: { min: 0, max: 2, step: 0.01 },
  outputGain: { min: 0, max: 2, step: 0.01 },
  wet: { min: 0, max: 1, step: 0.01 },
  lowCut: { min: 20, max: 600, step: 5 },
  eqLow: { min: -12, max: 12, step: 0.5 },
  eqMid: { min: -12, max: 12, step: 0.5 },
  eqMidFreq: { min: 300, max: 5000, step: 50 },
  eqHigh: { min: -12, max: 12, step: 0.5 },
  drive: { min: 0, max: 1, step: 0.01 },
  reverbMix: { min: 0, max: 1, step: 0.01 },
  reverbSize: { min: 0, max: 1, step: 0.01 },
  reverbDecay: { min: 0, max: 1, step: 0.01 },
  reverbDamp: { min: 0, max: 1, step: 0.01 },
  delayMix: { min: 0, max: 1, step: 0.01 },
  delayTime: { min: 0.02, max: 1, step: 0.005 },
  delayFeedback: { min: 0, max: 0.85, step: 0.01 },
  delayDamp: { min: 0, max: 1, step: 0.01 },
  chorusMix: { min: 0, max: 1, step: 0.01 },
  chorusRate: { min: 0.1, max: 6, step: 0.1 },
  chorusDepth: { min: 0, max: 1, step: 0.01 },
} as const satisfies Record<keyof EffectParams, { min: number; max: number; step: number }>;

/**
 * True when no effect signal can reach the mix bus. This drives both the
 * DRY SIGNAL badge and the engine's hard bypass, so the badge can never
 * disagree with the graph.
 */
export function isDry(p: EffectParams): boolean {
  if (p.wet <= 0) return true;
  return p.reverbMix <= 0 && p.delayMix <= 0 && p.chorusMix <= 0;
}

/** Human-readable list of what is actually contributing signal right now. */
export function activeEffects(p: EffectParams): string[] {
  if (isDry(p)) return [];
  const on: string[] = [];
  if (p.reverbMix > 0) on.push("Reverb");
  if (p.delayMix > 0) on.push("Echo");
  if (p.chorusMix > 0) on.push("Chorus");
  if (p.drive > 0) on.push("Drive");
  return on;
}

/** True when the EQ section is doing nothing audible. */
export function isFlatEq(p: EffectParams): boolean {
  return p.eqLow === 0 && p.eqMid === 0 && p.eqHigh === 0;
}
