// VoxFX low-latency voice effects engine.
// Signal graph:
//   mic -> inputGain -> hpf -> [dry] --------------------------\
//                            \-> distortion -> delay -> reverb -> wet -> outGain -> destination

export type EngineParams = {
  inputGain: number;      // 0..2
  outputGain: number;     // 0..2
  wet: number;            // 0..1 (dry = 1 - wet)
  reverb: number;         // 0..1  (reverb send)
  delayTime: number;      // 0..1 seconds
  delayFeedback: number;  // 0..0.9
  distortion: number;     // 0..1
  hpf: number;            // Hz, e.g. 60..400 (removes rumble/feedback)
  pitch: number;          // -12..+12 semitones (0 = off, uses granular via PitchShifter fallback = detune on delay only)
};

export const defaultParams: EngineParams = {
  inputGain: 1,
  outputGain: 1,
  wet: 0.6,
  reverb: 0.35,
  delayTime: 0.18,
  delayFeedback: 0.25,
  distortion: 0,
  hpf: 90,
  pitch: 0,
};

export type EnginePreset = {
  name: string;
  params: Partial<EngineParams>;
};

export const presets: EnginePreset[] = [
  { name: "Clean", params: { wet: 0, reverb: 0, delayTime: 0, delayFeedback: 0, distortion: 0 } },
  { name: "Hall", params: { wet: 0.7, reverb: 0.7, delayTime: 0.02, delayFeedback: 0.1, distortion: 0 } },
  { name: "Echo", params: { wet: 0.55, reverb: 0.2, delayTime: 0.28, delayFeedback: 0.45, distortion: 0 } },
  { name: "Stadium", params: { wet: 0.8, reverb: 0.9, delayTime: 0.35, delayFeedback: 0.5, distortion: 0 } },
  { name: "Robot", params: { wet: 0.7, reverb: 0.1, delayTime: 0.01, delayFeedback: 0.6, distortion: 0.55 } },
  { name: "Megaphone", params: { wet: 0.9, reverb: 0.05, delayTime: 0, delayFeedback: 0, distortion: 0.7, hpf: 350 } },
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

function makeImpulseResponse(ctx: AudioContext, seconds = 2.2, decay = 2.5) {
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
  private wetGain!: GainNode;
  private shaper!: WaveShaperNode;
  private preDelay!: GainNode;
  private delay!: DelayNode;
  private delayFb!: GainNode;
  private reverbSend!: GainNode;
  private convolver!: ConvolverNode;
  private convWet!: GainNode;
  private outGain!: GainNode;
  private params: EngineParams = { ...defaultParams };
  private _running = false;
  private _latencyMs = 0;

  get running() { return this._running; }
  get latencyMs() { return this._latencyMs; }
  get sampleRate() { return this.ctx?.sampleRate ?? 0; }

  async start() {
    if (this._running) return;

    // Request the mic with all DSP disabled — every "enhancement" adds latency.
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

    // Nodes
    this.inputGain = ctx.createGain();
    this.hpf = ctx.createBiquadFilter();
    this.hpf.type = "highpass";
    this.hpf.frequency.value = this.params.hpf;

    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = makeDistortionCurve(this.params.distortion);
    this.shaper.oversample = "2x";

    this.preDelay = ctx.createGain();
    this.delay = ctx.createDelay(2.0);
    this.delay.delayTime.value = this.params.delayTime;
    this.delayFb = ctx.createGain();
    this.delayFb.gain.value = this.params.delayFeedback;

    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = this.params.reverb;
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = makeImpulseResponse(ctx, 2.2, 2.5);
    this.convWet = ctx.createGain();
    this.convWet.gain.value = 1;

    this.outGain = ctx.createGain();
    this.outGain.gain.value = this.params.outputGain;

    // Graph
    src.connect(this.inputGain);
    this.inputGain.gain.value = this.params.inputGain;
    this.inputGain.connect(this.hpf);

    // Dry path
    this.hpf.connect(this.dryGain);
    this.dryGain.connect(this.outGain);

    // Wet path: hpf -> shaper -> preDelay -> [delay feedback loop] -> wetGain
    this.hpf.connect(this.shaper);
    this.shaper.connect(this.preDelay);
    this.preDelay.connect(this.delay);
    this.delay.connect(this.delayFb);
    this.delayFb.connect(this.delay);
    this.preDelay.connect(this.wetGain);
    this.delay.connect(this.wetGain);

    // Reverb send tap after wet chain
    this.wetGain.connect(this.reverbSend);
    this.reverbSend.connect(this.convolver);
    this.convolver.connect(this.convWet);
    this.convWet.connect(this.outGain);

    this.wetGain.connect(this.outGain);

    // Apply wet/dry mix
    this.applyWetDry();

    this.outGain.connect(ctx.destination);

    this._running = true;

    // Approximate round-trip latency
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
    const now = this.ctx.currentTime;
    const t = now + 0.02;
    if (next.inputGain !== undefined) this.inputGain.gain.linearRampToValueAtTime(next.inputGain, t);
    if (next.outputGain !== undefined) this.outGain.gain.linearRampToValueAtTime(next.outputGain, t);
    if (next.hpf !== undefined) this.hpf.frequency.linearRampToValueAtTime(next.hpf, t);
    if (next.delayTime !== undefined) this.delay.delayTime.linearRampToValueAtTime(next.delayTime, t);
    if (next.delayFeedback !== undefined) this.delayFb.gain.linearRampToValueAtTime(Math.min(0.9, next.delayFeedback), t);
    if (next.reverb !== undefined) this.reverbSend.gain.linearRampToValueAtTime(next.reverb, t);
    if (next.distortion !== undefined) this.shaper.curve = makeDistortionCurve(next.distortion);
    if (next.wet !== undefined) this.applyWetDry();
  }

  getParams(): EngineParams { return { ...this.params }; }

  private applyWetDry() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.02;
    const wet = this.params.wet;
    this.wetGain.gain.linearRampToValueAtTime(wet, t);
    this.dryGain.gain.linearRampToValueAtTime(1 - wet, t);
  }
}