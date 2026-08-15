// Pure DSP helpers for the VoxFX engine. No browser globals are touched at
// module scope so this file stays safe to import during SSR.

/**
 * Soft-clip transfer curve that always maps ±1 to ±1 and is the identity at
 * amount 0. The old curve attenuated by 1/3 at zero drive and boosted ~5x at
 * high drive, which made every driven preset jump in level.
 */
export function makeDriveCurve(amount: number, n = 2048) {
  const k = clamp01(amount) * 80;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = ((3 + k) * x) / (3 + k * Math.abs(x));
  }
  return curve;
}

/** Level compensation so raising drive does not raise perceived loudness. */
export function driveMakeup(amount: number): number {
  return 1 / (1 + clamp01(amount) * 1.6);
}

export type ImpulseSpec = {
  /** 0..1 room size */
  size: number;
  /** 0..1 decay character; higher = longer sustain within the room */
  decay: number;
  /** 0..1 high-frequency absorption; higher = darker tail */
  damp: number;
};

/** 0 -> 0.25s (booth), 1 -> 4.0s (dome). */
export function sizeToSeconds(size: number): number {
  return 0.25 + clamp01(size) * 3.75;
}

/**
 * Builds a decorrelated stereo impulse response. A one-pole lowpass is run over
 * the noise to emulate air/material absorption, and a short pre-delay keeps the
 * onset from smearing the direct signal.
 */
export function makeImpulseResponse(ctx: BaseAudioContext, spec: ImpulseSpec): AudioBuffer {
  const rate = ctx.sampleRate;
  const seconds = sizeToSeconds(spec.size);
  const length = Math.max(1, Math.floor(rate * seconds));
  const preDelay = Math.floor(rate * (0.005 + clamp01(spec.size) * 0.025));
  // decay 0 -> fast (exp 5), decay 1 -> slow (exp 1.4)
  const exponent = 5 - clamp01(spec.decay) * 3.6;
  // damp 0 -> open, damp 1 -> heavily absorbed
  const coeff = 1 - (0.12 + clamp01(spec.damp) * 0.78);
  const buffer = ctx.createBuffer(2, length, rate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = preDelay; i < length; i++) {
      const t = (i - preDelay) / (length - preDelay);
      const noise = Math.random() * 2 - 1;
      lp += coeff * (noise - lp);
      data[i] = lp * Math.pow(1 - t, exponent);
    }
  }
  return buffer;
}

/** Cache key so rapid preset switching reuses buffers instead of re-rendering. */
export function impulseKey(spec: ImpulseSpec, sampleRate: number): string {
  const q = (v: number) => Math.round(clamp01(v) * 20);
  return `${sampleRate}:${q(spec.size)}:${q(spec.decay)}:${q(spec.damp)}`;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Amplitude (0..1) to dBFS, floored so meters never render -Infinity. */
export function toDb(amplitude: number, floor = -72): number {
  if (amplitude <= 0) return floor;
  const db = 20 * Math.log10(amplitude);
  return db < floor ? floor : db;
}

/** Maps dBFS onto 0..1 meter travel, expanded near the top like a console meter. */
export function dbToMeter(db: number, floor = -60): number {
  if (db <= floor) return 0;
  const linear = (db - floor) / -floor;
  return clamp01(Math.pow(clamp01(linear), 0.72));
}
