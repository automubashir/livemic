// VoxFX low-latency voice effects engine.
// Signal graph:
//   mic -> inputGain -> hpf -> dry ------------------------------------\
//                            \-> shaper -> fxSend -> delay -> delayMix -> fxBus -> out
//                                              \-> reverbSend -> convolver -> reverbMix -> fxBus
//
// Delay and reverb are INDEPENDENT sends, so a preset can have pure reverb
// with zero echo (delayMix = 0) — like a real vocal processor.

export type EngineParams = {
  inputGain: number;      // 0..2
  outputGain: number;     // 0..2
  wet: number;            // 0..1 overall effect level (dry stays at unity)
  reverb: number;         // 0..1 reverb return level
  reverbSize: number;     // 0..1 room size (IR length)
  delayMix: number;       // 0..1 echo return level (0 = no echo at all)
  delayTime: number;      // 0..1 seconds
  delayFeedback: number;  // 0..0.85 repeats
  distortion: number;     // 0..1
  hpf: number;            // Hz
  pitch: number;          // reserved
};

export const defaultParams: EngineParams = {
  inputGain: 0.2,
  outputGain: 1,
  wet: 0.5,
  reverb: 0.3,
  reverbSize: 0.4,
  delayMix: 0,
  delayTime: 0.18,
  delayFeedback: 0.2,
  distortion: 0,
  hpf: 90,
  pitch: 0,
};

export type PresetGroup = "Speech" | "Karaoke" | "Singing" | "Mehfil" | "Tillawat" | "FX";

export type EnginePreset = {
  name: string;
  group: PresetGroup;
  hint: string;
  params: Omit<Partial<EngineParams>, "inputGain">;
};

export const groupOrder: PresetGroup[] = ["Speech", "Karaoke", "Singing", "Mehfil", "Tillawat", "FX"];

export const groupNotes: Record<PresetGroup, string> = {
  Speech: "Dry and intelligible — no echo",
  Karaoke: "Light reverb, little to no echo",
  Singing: "Studio vocal spaces, graded by size",
  Mehfil: "Live gathering echo — from subtle to hall",
  Tillawat: "Recitation echo — slow, clean repeats",
  FX: "Character effects",
};

export const presets: EnginePreset[] = [
  // ── Speech: zero echo ──
  { name: "Clean", group: "Speech", hint: "Dry voice, no effects", params: { wet: 0, reverb: 0, reverbSize: 0.3, delayMix: 0, delayTime: 0, delayFeedback: 0, distortion: 0, hpf: 90 } },
  { name: "Podcast", group: "Speech", hint: "Warm and tight, no echo", params: { wet: 0.25, reverb: 0.18, reverbSize: 0.15, delayMix: 0, delayTime: 0, delayFeedback: 0, distortion: 0.04, hpf: 110 } },
  { name: "Announcer", group: "Speech", hint: "PA presence, no repeats", params: { wet: 0.4, reverb: 0.35, reverbSize: 0.35, delayMix: 0, delayTime: 0, delayFeedback: 0, distortion: 0.06, hpf: 130 } },

  // ── Karaoke: light reverb, no hard echo ──
  { name: "Karaoke Soft", group: "Karaoke", hint: "Just a touch of room", params: { wet: 0.35, reverb: 0.28, reverbSize: 0.25, delayMix: 0, delayTime: 0, delayFeedback: 0, distortion: 0, hpf: 100 } },
  { name: "Karaoke Std", group: "Karaoke", hint: "Light plate reverb", params: { wet: 0.45, reverb: 0.42, reverbSize: 0.38, delayMix: 0, delayTime: 0, delayFeedback: 0, distortion: 0, hpf: 100 } },
  { name: "Karaoke Wide", group: "Karaoke", hint: "Roomy but still clean", params: { wet: 0.55, reverb: 0.55, reverbSize: 0.5, delayMix: 0.08, delayTime: 0.11, delayFeedback: 0.12, distortion: 0, hpf: 105 } },
  { name: "Party", group: "Karaoke", hint: "Fun, slight slap-back", params: { wet: 0.6, reverb: 0.5, reverbSize: 0.45, delayMix: 0.18, delayTime: 0.14, delayFeedback: 0.2, distortion: 0.05, hpf: 120 } },

  // ── Singing: graded studio spaces ──
  { name: "Vocal Booth", group: "Singing", hint: "Tiny, intimate, dry", params: { wet: 0.3, reverb: 0.22, reverbSize: 0.12, delayMix: 0, delayTime: 0, delayFeedback: 0, distortion: 0, hpf: 100 } },
  { name: "Studio Plate", group: "Singing", hint: "Classic polished plate", params: { wet: 0.45, reverb: 0.4, reverbSize: 0.3, delayMix: 0, delayTime: 0, delayFeedback: 0, distortion: 0, hpf: 100 } },
  { name: "Pop Sheen", group: "Singing", hint: "Plate + gentle slap", params: { wet: 0.5, reverb: 0.42, reverbSize: 0.32, delayMix: 0.14, delayTime: 0.09, delayFeedback: 0.14, distortion: 0.02, hpf: 115 } },
  { name: "R&B Silk", group: "Singing", hint: "Smooth 1/8 note echo", params: { wet: 0.5, reverb: 0.35, reverbSize: 0.35, delayMix: 0.22, delayTime: 0.25, delayFeedback: 0.24, distortion: 0, hpf: 105 } },
  { name: "Ballad Hall", group: "Singing", hint: "Long lush tail", params: { wet: 0.6, reverb: 0.68, reverbSize: 0.7, delayMix: 0.08, delayTime: 0.3, delayFeedback: 0.15, distortion: 0, hpf: 95 } },
  { name: "Gospel Choir", group: "Singing", hint: "Huge church space", params: { wet: 0.7, reverb: 0.85, reverbSize: 0.9, delayMix: 0.1, delayTime: 0.28, delayFeedback: 0.18, distortion: 0, hpf: 90 } },
  { name: "Rock Grit", group: "Singing", hint: "Driven, medium room", params: { wet: 0.5, reverb: 0.35, reverbSize: 0.3, delayMix: 0.12, delayTime: 0.12, delayFeedback: 0.2, distortion: 0.4, hpf: 140 } },

  // ── Mehfil: gathering echo, graded ──
  { name: "Mehfil Light", group: "Mehfil", hint: "Small gathering, soft echo", params: { wet: 0.5, reverb: 0.4, reverbSize: 0.4, delayMix: 0.18, delayTime: 0.2, delayFeedback: 0.18, distortion: 0, hpf: 100 } },
  { name: "Mehfil Classic", group: "Mehfil", hint: "Warm hall echo", params: { wet: 0.6, reverb: 0.55, reverbSize: 0.55, delayMix: 0.3, delayTime: 0.26, delayFeedback: 0.3, distortion: 0, hpf: 95 } },
  { name: "Mehfil Grand", group: "Mehfil", hint: "Big hall, long repeats", params: { wet: 0.7, reverb: 0.72, reverbSize: 0.75, delayMix: 0.4, delayTime: 0.34, delayFeedback: 0.4, distortion: 0, hpf: 90 } },
  { name: "Qawwali", group: "Mehfil", hint: "Powerful, rhythmic echo", params: { wet: 0.72, reverb: 0.6, reverbSize: 0.6, delayMix: 0.45, delayTime: 0.3, delayFeedback: 0.45, distortion: 0.05, hpf: 100 } },

  // ── Tillawat: recitation echo ──
  { name: "Tillawat Soft", group: "Tillawat", hint: "Clean, subtle space", params: { wet: 0.45, reverb: 0.42, reverbSize: 0.5, delayMix: 0.12, delayTime: 0.28, delayFeedback: 0.14, distortion: 0, hpf: 90 } },
  { name: "Tillawat Masjid", group: "Tillawat", hint: "Masjid-style echo", params: { wet: 0.65, reverb: 0.7, reverbSize: 0.75, delayMix: 0.3, delayTime: 0.38, delayFeedback: 0.3, distortion: 0, hpf: 85 } },
  { name: "Tillawat Grand", group: "Tillawat", hint: "Large dome, long tail", params: { wet: 0.78, reverb: 0.88, reverbSize: 0.95, delayMix: 0.4, delayTime: 0.46, delayFeedback: 0.42, distortion: 0, hpf: 80 } },
  { name: "Naat", group: "Tillawat", hint: "Melodic, warm repeats", params: { wet: 0.62, reverb: 0.6, reverbSize: 0.6, delayMix: 0.32, delayTime: 0.34, delayFeedback: 0.32, distortion: 0, hpf: 90 } },

  // ── FX ──
  { name: "Stadium", group: "FX", hint: "Massive slap-back", params: { wet: 0.8, reverb: 0.85, reverbSize: 0.95, delayMix: 0.5, delayTime: 0.35, delayFeedback: 0.5, distortion: 0, hpf: 90 } },
  { name: "Robot", group: "FX", hint: "Metallic comb tone", params: { wet: 0.8, reverb: 0.1, reverbSize: 0.1, delayMix: 0.9, delayTime: 0.01, delayFeedback: 0.7, distortion: 0.55, hpf: 150 } },
  { name: "Megaphone", group: "FX", hint: "Thin & distorted", params: { wet: 0.6, reverb: 0.05, reverbSize: 0.1, delayMix: 0, delayTime: 0, delayFeedback: 0, distortion: 0.7, hpf: 350 } },
  { name: "Cave", group: "FX", hint: "Dark endless space", params: { wet: 0.85, reverb: 0.95, reverbSize: 1, delayMix: 0.6, delayTime: 0.5, delayFeedback: 0.65, distortion: 0, hpf: 70 } },
];

function makeDistortionCurve(amount: number) {
  const k = amount * 100;
  const n = 1024;
  const curve = new Float32Array(n);
  const deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function sizeToSeconds(size: number) {
  // 0 -> 0.25s (booth), 1 -> 4.5s (dome)
  return 0.25 + Math.max(0, Math.min(1, size)) * 4.25;
}

function makeImpulseResponse(ctx: AudioContext, seconds: number, decay = 2.6) {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

export class VoxFXEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private inputGain!: GainNode;
  private hpf!: BiquadFilterNode;
  private dryGain!: GainNode;
  private shaper!: WaveShaperNode;
  private fxSend!: GainNode;
  private delay!: DelayNode;
  private delayFb!: GainNode;
  private delayDamp!: BiquadFilterNode;
  private delayMix!: GainNode;
  private reverbSend!: GainNode;
  private convolver!: ConvolverNode;
  private reverbMix!: GainNode;
  private fxBus!: GainNode;
  private outGain!: GainNode;
  private params: EngineParams = { ...defaultParams };
  private _running = false;
  private _latencyMs = 0;
  private irSize = -1;

  get running() { return this._running; }
  get latencyMs() { return this._latencyMs; }
  get sampleRate() { return this.ctx?.sampleRate ?? 0; }

  async start() {
    if (this._running) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        latency: 0,
        channelCount: 1,
      } as MediaTrackConstraints,
      video: false,
    });
    this.stream = stream;

    const AC: typeof AudioContext =
      (window.AudioContext ||
        // @ts-expect-error webkit
        window.webkitAudioContext) as typeof AudioContext;
    const ctx = new AC({ latencyHint: "interactive" });
    this.ctx = ctx;
    await ctx.resume();

    const src = ctx.createMediaStreamSource(stream);
    this.src = src;

    const p = this.params;

    this.inputGain = ctx.createGain();
    this.inputGain.gain.value = p.inputGain;

    this.hpf = ctx.createBiquadFilter();
    this.hpf.type = "highpass";
    this.hpf.frequency.value = p.hpf;

    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1; // dry always at unity — effects are sends

    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = makeDistortionCurve(p.distortion);
    this.shaper.oversample = "2x";

    this.fxSend = ctx.createGain();
    this.fxSend.gain.value = p.wet;

    this.delay = ctx.createDelay(2.0);
    this.delay.delayTime.value = p.delayTime;
    this.delayFb = ctx.createGain();
    this.delayFb.gain.value = Math.min(0.85, p.delayFeedback);
    this.delayDamp = ctx.createBiquadFilter();
    this.delayDamp.type = "lowpass";
    this.delayDamp.frequency.value = 4200; // natural, non-harsh repeats
    this.delayMix = ctx.createGain();
    this.delayMix.gain.value = p.delayMix;

    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 1;
    this.convolver = ctx.createConvolver();
    this.irSize = p.reverbSize;
    this.convolver.buffer = makeImpulseResponse(ctx, sizeToSeconds(p.reverbSize));
    this.reverbMix = ctx.createGain();
    this.reverbMix.gain.value = p.reverb;

    this.fxBus = ctx.createGain();
    this.fxBus.gain.value = 1;

    this.outGain = ctx.createGain();
    this.outGain.gain.value = p.outputGain;

    // Graph
    src.connect(this.inputGain);
    this.inputGain.connect(this.hpf);

    this.hpf.connect(this.dryGain);
    this.dryGain.connect(this.outGain);

    this.hpf.connect(this.shaper);
    this.shaper.connect(this.fxSend);

    // Echo send (fully independent — delayMix 0 means no echo)
    this.fxSend.connect(this.delay);
    this.delay.connect(this.delayDamp);
    this.delayDamp.connect(this.delayFb);
    this.delayFb.connect(this.delay);
    this.delay.connect(this.delayMix);
    this.delayMix.connect(this.fxBus);

    // Reverb send (fed by dry signal + echo repeats)
    this.fxSend.connect(this.reverbSend);
    this.delayMix.connect(this.reverbSend);
    this.reverbSend.connect(this.convolver);
    this.convolver.connect(this.reverbMix);
    this.reverbMix.connect(this.fxBus);

    this.fxBus.connect(this.outGain);
    this.outGain.connect(ctx.destination);

    this._running = true;

    const base = (ctx.baseLatency || 0) * 1000;
    const out = ((ctx as unknown as { outputLatency?: number }).outputLatency || 0) * 1000;
    this._latencyMs = Math.round(base + out);
  }

  async stop() {
    this._running = false;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.ctx) {
      try { await this.ctx.close(); } catch { /* noop */ }
      this.ctx = null;
    }
  }

  update(next: Partial<EngineParams>) {
    this.params = { ...this.params, ...next };
    if (!this._running || !this.ctx) return;
    const t = this.ctx.currentTime + 0.02;
    if (next.inputGain !== undefined) this.inputGain.gain.linearRampToValueAtTime(next.inputGain, t);
    if (next.outputGain !== undefined) this.outGain.gain.linearRampToValueAtTime(next.outputGain, t);
    if (next.hpf !== undefined) this.hpf.frequency.linearRampToValueAtTime(next.hpf, t);
    if (next.wet !== undefined) this.fxSend.gain.linearRampToValueAtTime(next.wet, t);
    if (next.delayTime !== undefined) this.delay.delayTime.linearRampToValueAtTime(next.delayTime, t);
    if (next.delayFeedback !== undefined) this.delayFb.gain.linearRampToValueAtTime(Math.min(0.85, next.delayFeedback), t);
    if (next.delayMix !== undefined) this.delayMix.gain.linearRampToValueAtTime(next.delayMix, t);
    if (next.reverb !== undefined) this.reverbMix.gain.linearRampToValueAtTime(next.reverb, t);
    if (next.distortion !== undefined) this.shaper.curve = makeDistortionCurve(next.distortion);
    if (next.reverbSize !== undefined && Math.abs(next.reverbSize - this.irSize) > 0.02) {
      this.irSize = next.reverbSize;
      this.convolver.buffer = makeImpulseResponse(this.ctx, sizeToSeconds(next.reverbSize));
    }
  }

  getParams(): EngineParams { return { ...this.params }; }
}
