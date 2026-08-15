// VoxFX audio engine.
//
// Design rules that keep the monitor path honest:
//   1. Exactly one AudioContext per page, created lazily and never replaced.
//   2. Exactly one MediaStream + one MediaStreamAudioSourceNode, held in single
//      fields that are always torn down before being reassigned.
//   3. Exactly one outgoing edge from `outAnalyser` — the only node in the graph
//      that touches a sink. Routing always disconnects before connecting.
//   4. The graph is built once. Preset and slider changes only write AudioParams.
//   5. "Dry" is structural: when no effect return is open, the FX branch is
//      physically disconnected from the tone chain and its delay line is rebuilt.
//
// Signal flow:
//   mic -> source -> inputGain -+-> inputAnalyser (metering tap, terminal)
//                               |
//                               +-> lowCut -> eqLow -> eqMid -> eqHigh = toneOut
//
//   toneOut -+-> dryGain ------------------------------------------> mixBus
//            |
//            +-> fxInput(wet) -> drive -> fxSplit -+-> delay  -> delayReturn  -> mixBus
//                                                  +-> chorus -> chorusReturn -> mixBus
//                                                  +-> reverbIn -> convolver -> reverbReturn -> mixBus
//
//   mixBus -> master(outputGain) -> muteGain -> [limiter] -> outAnalyser -> ONE sink

import {
  clamp,
  clamp01,
  driveMakeup,
  impulseKey,
  makeDriveCurve,
  makeImpulseResponse,
  toDb,
} from "./dsp";
import { DRY_PARAMS, activeEffects, isDry, type EffectParams } from "./params";
import { DEFAULT_PRESET_ID, findPreset, resolvePreset, type Preset } from "./presets";

const MAX_DELAY_SECONDS = 1.5;
const RAMP_SECONDS = 0.03;
/** How long after a fade-out before we physically cut the FX branch. */
const FLUSH_DELAY_MS = 90;
const CHORUS_BASE_DELAY = 0.02;
const CHORUS_MAX_EXCURSION = 0.006;
const CLIP_THRESHOLD = 0.99;
const CLIP_HOLD_MS = 1200;

export type EngineStatus = "idle" | "initializing" | "live" | "stopping";
export type MicPermission = "unknown" | "prompt" | "granted" | "denied";
export type OutputRoute = "direct" | "element";

export type MicProcessing = {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
};

/**
 * Live monitoring wants the browser's voice-call processing OFF: echo
 * cancellation fights intentional reverb/echo, and AGC pumps the level under
 * sustained singing. These are requests — `appliedProcessing` reports what the
 * browser actually granted.
 */
export const LIVE_MIC_PROCESSING: MicProcessing = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

export type EngineErrorKind =
  | "permission-denied"
  | "no-device"
  | "device-in-use"
  | "insecure-context"
  | "unsupported"
  | "output-route"
  | "unknown";

export type EngineError = {
  kind: EngineErrorKind;
  message: string;
  hint?: string;
};

export type DeviceInfo = { deviceId: string; label: string };

export type Levels = {
  inRms: number;
  inPeak: number;
  outRms: number;
  outPeak: number;
  inHold: number;
  outHold: number;
  inClip: boolean;
  outClip: boolean;
};

export const SILENT_LEVELS: Levels = {
  inRms: -72,
  inPeak: -72,
  outRms: -72,
  outPeak: -72,
  inHold: -72,
  outHold: -72,
  inClip: false,
  outClip: false,
};

export type EngineSnapshot = {
  status: EngineStatus;
  permission: MicPermission;
  error: EngineError | null;
  contextState: AudioContextState | "none";
  sampleRate: number;
  baseLatencyMs: number | null;
  outputLatencyMs: number | null;
  micProcessing: MicProcessing;
  appliedProcessing: Partial<MicProcessing>;
  inputDeviceId: string | null;
  inputDeviceLabel: string | null;
  outputDeviceId: string | null;
  outputDeviceLabel: string;
  outputRoute: OutputRoute;
  inputDevices: DeviceInfo[];
  outputDevices: DeviceInfo[];
  sinkIdSupported: boolean;
  deviceSelectionSupported: boolean;
  activeStreams: number;
  activeContexts: number;
  params: EffectParams;
  presetId: string;
  /** True once a sound parameter has been nudged away from the stored preset. */
  presetDirty: boolean;
  dry: boolean;
  activeEffectNames: string[];
  muted: boolean;
  limiterEnabled: boolean;
};

export const INITIAL_SNAPSHOT: EngineSnapshot = {
  status: "idle",
  permission: "unknown",
  error: null,
  contextState: "none",
  sampleRate: 0,
  baseLatencyMs: null,
  outputLatencyMs: null,
  micProcessing: LIVE_MIC_PROCESSING,
  appliedProcessing: {},
  inputDeviceId: null,
  inputDeviceLabel: null,
  outputDeviceId: null,
  outputDeviceLabel: "System default",
  outputRoute: "direct",
  inputDevices: [],
  outputDevices: [],
  sinkIdSupported: false,
  deviceSelectionSupported: false,
  activeStreams: 0,
  activeContexts: 0,
  params: DRY_PARAMS,
  presetId: DEFAULT_PRESET_ID,
  presetDirty: false,
  dry: true,
  activeEffectNames: [],
  muted: false,
  limiterEnabled: true,
};

type Graph = {
  inputGain: GainNode;
  inputAnalyser: AnalyserNode;
  lowCut: BiquadFilterNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  toneOut: BiquadFilterNode;
  dryGain: GainNode;
  fxInput: GainNode;
  driveIn: GainNode;
  shaper: WaveShaperNode;
  driveOut: GainNode;
  fxSplit: GainNode;
  delay: DelayNode;
  delayDamp: BiquadFilterNode;
  delayFb: GainNode;
  delayReturn: GainNode;
  chorusDelay: DelayNode;
  chorusLfo: OscillatorNode;
  chorusDepth: GainNode;
  chorusReturn: GainNode;
  reverbIn: GainNode;
  convolver: ConvolverNode;
  reverbReturn: GainNode;
  mixBus: GainNode;
  master: GainNode;
  muteGain: GainNode;
  limiter: DynamicsCompressorNode;
  outAnalyser: AnalyserNode;
};

export function supportsSinkId(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof HTMLMediaElement !== "undefined" &&
    "setSinkId" in HTMLMediaElement.prototype
  );
}

export function supportsDeviceSelection(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.enumerateDevices === "function"
  );
}

export function supportsGetUserMedia(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private graph: Graph | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private streamDest: MediaStreamAudioDestinationNode | null = null;
  private audioEl: HTMLAudioElement | null = null;

  private params: EffectParams = { ...DRY_PARAMS };
  private bypassed = true;
  private irCache = new Map<string, AudioBuffer>();
  private currentIrKey = "";
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  /** Invalidates an in-flight start() when stop() lands first. */
  private generation = 0;
  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;
  private initialised = false;
  private wetBeforeBypass: number | null = null;

  private snapshot: EngineSnapshot = INITIAL_SNAPSHOT;
  private stateListeners = new Set<() => void>();
  private levelListeners = new Set<(l: Levels) => void>();

  private rafId: number | null = null;
  private inBuf = new Float32Array(1024);
  private outBuf = new Float32Array(1024);
  private levels: Levels = { ...SILENT_LEVELS };
  private holdIn = 0;
  private holdOut = 0;
  private clipInUntil = 0;
  private clipOutUntil = 0;

  // ── External store plumbing ───────────────────────────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  };

  getSnapshot = (): EngineSnapshot => this.snapshot;

  subscribeLevels(listener: (l: Levels) => void): () => void {
    this.levelListeners.add(listener);
    return () => {
      this.levelListeners.delete(listener);
    };
  }

  getLevels(): Levels {
    return this.levels;
  }

  private patch(next: Partial<EngineSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    for (const l of this.stateListeners) l();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Safe to call repeatedly (StrictMode double-mount): only runs once. */
  init() {
    if (this.initialised || typeof window === "undefined") return;
    this.initialised = true;

    this.patch({
      sinkIdSupported: supportsSinkId(),
      deviceSelectionSupported: supportsDeviceSelection(),
    });

    if (supportsDeviceSelection()) {
      navigator.mediaDevices.addEventListener("devicechange", this.handleDeviceChange);
      void this.refreshDevices();
    }
    window.addEventListener("pagehide", this.handlePageHide);
    void this.watchPermission();
  }

  private handleDeviceChange = () => {
    void this.refreshDevices();
  };

  private handlePageHide = () => {
    void this.destroy();
  };

  private async watchPermission() {
    try {
      const perms = navigator.permissions as
        { query: (d: { name: string }) => Promise<PermissionStatus> } | undefined;
      if (!perms?.query) return;
      const status = await perms.query({ name: "microphone" });
      this.patch({ permission: status.state as MicPermission });
      status.onchange = () => this.patch({ permission: status.state as MicPermission });
    } catch {
      // Firefox/Safari do not expose the microphone permission descriptor.
    }
  }

  async start(): Promise<void> {
    if (this.snapshot.status === "live") return;
    if (this.startPromise) return this.startPromise;

    // Assigned before any await, so concurrent callers always join this run
    // rather than beginning a second one. Waiting on a pending stop happens
    // inside the guarded promise for the same reason.
    this.startPromise = (async () => {
      if (this.stopPromise) await this.stopPromise;
      await this.runStart();
    })().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private async runStart(): Promise<void> {
    this.init();
    this.patch({ status: "initializing", error: null });

    if (!supportsGetUserMedia()) {
      this.fail({
        kind: "unsupported",
        message: "This browser does not expose microphone capture.",
        hint: "Try the latest Chrome, Edge, Firefox or Safari.",
      });
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      this.fail({
        kind: "insecure-context",
        message: "Microphone access requires a secure connection.",
        hint: "Open this page over HTTPS or on localhost.",
      });
      return;
    }

    const gen = ++this.generation;
    let stream: MediaStream;
    try {
      stream = await this.openStream();
    } catch (e) {
      this.fail(describeGumError(e));
      return;
    }

    // A stop() (or a device switch) landed while getUserMedia was pending —
    // release this stream instead of letting it become a second live input.
    if (gen !== this.generation) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    try {
      const ctx = this.ensureContext();
      // Autoplay policy: resume must follow the user gesture that called start().
      if (ctx.state !== "running") await ctx.resume();

      if (gen !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      this.attachStream(stream);
      this.applyParams(this.params, { immediate: true });
      await this.routeOutput();

      // routeOutput can await setSinkId/play — re-check before declaring live.
      if (gen !== this.generation) {
        this.detachStream();
        return;
      }
      this.startMetering();

      this.patch({
        status: "live",
        permission: "granted",
        contextState: ctx.state,
        sampleRate: ctx.sampleRate,
        baseLatencyMs: msOrNull(ctx.baseLatency),
        outputLatencyMs: msOrNull((ctx as { outputLatency?: number }).outputLatency),
        activeStreams: 1,
        activeContexts: 1,
      });
      void this.refreshDevices();
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      this.fail({
        kind: "unknown",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async openStream(): Promise<MediaStream> {
    const p = this.snapshot.micProcessing;
    const deviceId = this.snapshot.inputDeviceId;
    const base: MediaTrackConstraints = {
      echoCancellation: p.echoCancellation,
      noiseSuppression: p.noiseSuppression,
      autoGainControl: p.autoGainControl,
      channelCount: 1,
    };
    if (deviceId) base.deviceId = { exact: deviceId };

    try {
      return await navigator.mediaDevices.getUserMedia({ audio: base, video: false });
    } catch (e) {
      // Some mobile/Safari device combinations reject `exact` device ids or the
      // processing toggles. Retry once with the plainest possible request.
      if (e instanceof Error && (e.name === "OverconstrainedError" || e.name === "NotFoundError")) {
        return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
      throw e;
    }
  }

  private attachStream(stream: MediaStream) {
    const ctx = this.ctx!;
    const graph = this.graph!;

    // Tear down before assigning: makes a duplicate source structurally
    // impossible rather than merely unlikely.
    this.detachStream();

    this.stream = stream;
    this.source = ctx.createMediaStreamSource(stream);
    this.source.connect(graph.inputGain);

    const track = stream.getAudioTracks()[0];
    if (track) {
      const settings = track.getSettings() as Partial<MicProcessing> & { deviceId?: string };
      this.patch({
        appliedProcessing: {
          echoCancellation: settings.echoCancellation,
          noiseSuppression: settings.noiseSuppression,
          autoGainControl: settings.autoGainControl,
        },
        inputDeviceId: settings.deviceId ?? this.snapshot.inputDeviceId,
        inputDeviceLabel: track.label || "Default microphone",
      });
      track.addEventListener("ended", this.handleTrackEnded);
    }
  }

  private handleTrackEnded = () => {
    if (this.snapshot.status !== "live") return;
    void this.stop();
    this.patch({
      error: {
        kind: "no-device",
        message: "The microphone was disconnected.",
        hint: "Reconnect it or pick another input, then start again.",
      },
    });
  };

  private detachStream() {
    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        /* already detached */
      }
      this.source = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.removeEventListener("ended", this.handleTrackEnded);
        track.stop();
      }
      this.stream = null;
    }
  }

  async stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = this.runStop().finally(() => {
      this.stopPromise = null;
    });
    return this.stopPromise;
  }

  private async runStop(): Promise<void> {
    // Bump first so any getUserMedia still in flight discards its stream.
    this.generation++;
    if (this.snapshot.status === "idle" && !this.stream) {
      this.patch({ activeStreams: 0 });
      return;
    }
    this.patch({ status: "stopping" });

    this.stopMetering();
    this.detachStream();
    this.teardownElementRoute();

    if (this.ctx && this.ctx.state === "running") {
      try {
        await this.ctx.suspend();
      } catch {
        /* noop */
      }
    }

    this.levels = { ...SILENT_LEVELS };
    this.holdIn = 0;
    this.holdOut = 0;
    for (const l of this.levelListeners) l(this.levels);

    this.patch({
      status: "idle",
      activeStreams: 0,
      contextState: this.ctx?.state ?? "none",
      appliedProcessing: {},
    });
  }

  /** Full teardown — page unload or component unmount for good. */
  async destroy(): Promise<void> {
    await this.stop();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("pagehide", this.handlePageHide);
      if (supportsDeviceSelection()) {
        navigator.mediaDevices.removeEventListener("devicechange", this.handleDeviceChange);
      }
    }
    if (this.graph) {
      try {
        this.graph.chorusLfo.stop();
      } catch {
        /* already stopped */
      }
    }
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch {
        /* noop */
      }
      this.ctx = null;
    }
    this.graph = null;
    this.irCache.clear();
    this.currentIrKey = "";
    this.initialised = false;
    this.patch({ contextState: "none", activeContexts: 0, activeStreams: 0, status: "idle" });
  }

  private fail(error: EngineError) {
    this.patch({
      status: "idle",
      error,
      permission: error.kind === "permission-denied" ? "denied" : this.snapshot.permission,
      activeStreams: 0,
    });
  }

  clearError() {
    if (this.snapshot.error) this.patch({ error: null });
  }

  // ── Graph construction (exactly once per context) ─────────────────────────

  private ensureContext(): AudioContext {
    if (this.ctx && this.ctx.state !== "closed") return this.ctx;

    const Ctor = (window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)!;
    const ctx = new Ctor({ latencyHint: "interactive" });
    this.ctx = ctx;
    this.graph = this.buildGraph(ctx);
    this.patch({ activeContexts: 1, contextState: ctx.state, sampleRate: ctx.sampleRate });
    return ctx;
  }

  private buildGraph(ctx: AudioContext): Graph {
    const p = this.params;

    const inputGain = ctx.createGain();
    inputGain.gain.value = p.inputGain;

    const inputAnalyser = ctx.createAnalyser();
    inputAnalyser.fftSize = 1024;
    inputAnalyser.smoothingTimeConstant = 0;

    const lowCut = ctx.createBiquadFilter();
    lowCut.type = "highpass";
    lowCut.frequency.value = p.lowCut;
    lowCut.Q.value = 0.7;

    const eqLow = ctx.createBiquadFilter();
    eqLow.type = "lowshelf";
    eqLow.frequency.value = 180;
    eqLow.gain.value = p.eqLow;

    const eqMid = ctx.createBiquadFilter();
    eqMid.type = "peaking";
    eqMid.frequency.value = p.eqMidFreq;
    eqMid.Q.value = 0.9;
    eqMid.gain.value = p.eqMid;

    const eqHigh = ctx.createBiquadFilter();
    eqHigh.type = "highshelf";
    eqHigh.frequency.value = 6000;
    eqHigh.gain.value = p.eqHigh;

    const dryGain = ctx.createGain();
    dryGain.gain.value = 1; // the direct path is always unity — effects are sends

    const fxInput = ctx.createGain();
    fxInput.gain.value = p.wet;

    const driveIn = ctx.createGain();
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDriveCurve(p.drive);
    shaper.oversample = "2x";
    const driveOut = ctx.createGain();
    driveOut.gain.value = driveMakeup(p.drive);

    const fxSplit = ctx.createGain();

    const delay = ctx.createDelay(MAX_DELAY_SECONDS);
    delay.delayTime.value = clamp(p.delayTime, 0.001, MAX_DELAY_SECONDS);
    const delayDamp = ctx.createBiquadFilter();
    delayDamp.type = "lowpass";
    delayDamp.frequency.value = dampToHz(p.delayDamp);
    const delayFb = ctx.createGain();
    delayFb.gain.value = clamp(p.delayFeedback, 0, 0.85);
    const delayReturn = ctx.createGain();
    delayReturn.gain.value = p.delayMix;

    const chorusDelay = ctx.createDelay(0.1);
    chorusDelay.delayTime.value = CHORUS_BASE_DELAY;
    const chorusLfo = ctx.createOscillator();
    chorusLfo.type = "sine";
    chorusLfo.frequency.value = p.chorusRate;
    const chorusDepth = ctx.createGain();
    chorusDepth.gain.value = p.chorusDepth * CHORUS_MAX_EXCURSION;
    const chorusReturn = ctx.createGain();
    chorusReturn.gain.value = p.chorusMix;

    const reverbIn = ctx.createGain();
    const convolver = ctx.createConvolver();
    convolver.normalize = true;
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = p.reverbMix;

    const mixBus = ctx.createGain();
    const master = ctx.createGain();
    master.gain.value = p.outputGain;
    const muteGain = ctx.createGain();
    muteGain.gain.value = this.snapshot.muted ? 0 : 1;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;

    const outAnalyser = ctx.createAnalyser();
    outAnalyser.fftSize = 1024;
    outAnalyser.smoothingTimeConstant = 0;

    // ── wiring ──
    inputGain.connect(inputAnalyser); // metering tap, terminal by design
    inputGain.connect(lowCut);
    lowCut.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);

    eqHigh.connect(dryGain);
    dryGain.connect(mixBus);

    // eqHigh -> fxInput is deliberately NOT connected here. The engine starts
    // bypassed and connects the FX branch only when an effect is actually open.
    fxInput.connect(driveIn);
    driveIn.connect(driveOut); // drive 0 = clean bypass around the shaper
    driveOut.connect(fxSplit);

    fxSplit.connect(delay);
    delay.connect(delayDamp);
    delayDamp.connect(delayFb);
    delayFb.connect(delay);
    delay.connect(delayReturn);
    delayReturn.connect(mixBus);

    fxSplit.connect(chorusDelay);
    chorusLfo.connect(chorusDepth);
    chorusDepth.connect(chorusDelay.delayTime);
    chorusDelay.connect(chorusReturn);
    chorusReturn.connect(mixBus);

    fxSplit.connect(reverbIn);
    delayReturn.connect(reverbIn); // echoes wash into the room, as on a real desk
    reverbIn.connect(convolver);
    convolver.connect(reverbReturn);
    reverbReturn.connect(mixBus);

    mixBus.connect(master);
    master.connect(muteGain);
    // Honour a limiter toggle made before the graph existed.
    if (this.snapshot.limiterEnabled) {
      muteGain.connect(limiter);
      limiter.connect(outAnalyser);
    } else {
      muteGain.connect(outAnalyser);
    }
    // outAnalyser -> sink is owned exclusively by routeOutput().

    chorusLfo.start();

    const graph: Graph = {
      inputGain,
      inputAnalyser,
      lowCut,
      eqLow,
      eqMid,
      eqHigh,
      toneOut: eqHigh,
      dryGain,
      fxInput,
      driveIn,
      shaper,
      driveOut,
      fxSplit,
      delay,
      delayDamp,
      delayFb,
      delayReturn,
      chorusDelay,
      chorusLfo,
      chorusDepth,
      chorusReturn,
      reverbIn,
      convolver,
      reverbReturn,
      mixBus,
      master,
      muteGain,
      limiter,
      outAnalyser,
    };

    this.bypassed = true;
    this.applyImpulse(graph, ctx, this.params, true);
    return graph;
  }

  // ── Parameter application ─────────────────────────────────────────────────

  /**
   * The single entry point for sound changes. Never rebuilds the graph; only
   * writes AudioParams, swaps the impulse buffer, and toggles the hard bypass.
   */
  applyParams(next: EffectParams, opts: { immediate?: boolean; presetId?: string } = {}) {
    const prev = this.params;
    this.params = next;

    const dry = isDry(next);
    this.patch({
      params: next,
      dry,
      activeEffectNames: activeEffects(next),
      ...(opts.presetId ? { presetId: opts.presetId } : null),
    });

    const graph = this.graph;
    const ctx = this.ctx;
    if (!graph || !ctx) return;

    const t = opts.immediate ? 0 : RAMP_SECONDS;

    this.ramp(graph.inputGain.gain, next.inputGain, t);
    this.ramp(graph.master.gain, next.outputGain, t);
    this.ramp(graph.lowCut.frequency, next.lowCut, t);
    this.ramp(graph.eqLow.gain, next.eqLow, t);
    this.ramp(graph.eqMid.gain, next.eqMid, t);
    this.ramp(graph.eqMid.frequency, next.eqMidFreq, t);
    this.ramp(graph.eqHigh.gain, next.eqHigh, t);

    this.ramp(graph.fxInput.gain, next.wet, t);
    this.ramp(graph.delayReturn.gain, next.delayMix, t);
    this.ramp(graph.delay.delayTime, clamp(next.delayTime, 0.001, MAX_DELAY_SECONDS), t);
    this.ramp(graph.delayFb.gain, clamp(next.delayFeedback, 0, 0.85), t);
    this.ramp(graph.delayDamp.frequency, dampToHz(next.delayDamp), t);
    this.ramp(graph.reverbReturn.gain, next.reverbMix, t);
    this.ramp(graph.chorusReturn.gain, next.chorusMix, t);
    this.ramp(graph.chorusLfo.frequency, next.chorusRate, t);
    this.ramp(graph.chorusDepth.gain, next.chorusDepth * CHORUS_MAX_EXCURSION, t);

    if (next.drive !== prev.drive || opts.immediate) {
      this.setDrive(graph, next.drive, t);
    }
    this.applyImpulse(graph, ctx, next, false);

    // Leaving an effect: fade first, then physically cut and flush the tail.
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (dry) {
      if (!this.bypassed) this.scheduleFlush();
    } else {
      if (this.bypassed) this.disengageBypass();
      if (next.delayMix <= 0 && prev.delayMix > 0) this.scheduleFlush();
      if (next.reverbMix <= 0 && prev.reverbMix > 0) this.scheduleFlush();
    }
  }

  getParams(): EffectParams {
    return this.params;
  }

  /** Levels are mic/room controls, so they never mark the preset as edited. */
  setParam<K extends keyof EffectParams>(key: K, value: number) {
    const isLevel = key === "inputGain" || key === "outputGain";
    if (!isLevel && !this.snapshot.presetDirty) this.patch({ presetDirty: true });
    this.applyParams({ ...this.params, [key]: value });
  }

  selectPreset(preset: Preset) {
    this.wetBeforeBypass = null;
    this.patch({ presetDirty: false });
    this.applyParams(resolvePreset(preset, this.params), { presetId: preset.id });
  }

  /**
   * Master effect bypass. Setting `wet` to 0 closes the single gate feeding the
   * whole FX branch, which then triggers the structural bypass in applyParams.
   */
  toggleFxBypass() {
    if (this.params.wet > 0) {
      this.wetBeforeBypass = this.params.wet;
      this.applyParams({ ...this.params, wet: 0 });
      return;
    }
    const preset = findPreset(this.snapshot.presetId);
    const restore = this.wetBeforeBypass ?? preset?.params.wet ?? 0.5;
    this.wetBeforeBypass = null;
    this.applyParams({ ...this.params, wet: restore });
  }

  private ramp(param: AudioParam, value: number, seconds: number) {
    const ctx = this.ctx;
    if (!ctx) {
      param.value = value;
      return;
    }
    if (seconds <= 0) {
      param.cancelScheduledValues(ctx.currentTime);
      param.value = value;
      return;
    }
    const now = ctx.currentTime;
    const holdable = param as AudioParam & { cancelAndHoldAtTime?: (t: number) => void };
    if (typeof holdable.cancelAndHoldAtTime === "function") {
      holdable.cancelAndHoldAtTime(now);
    } else {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
    }
    param.linearRampToValueAtTime(value, now + seconds);
  }

  private setDrive(graph: Graph, amount: number, seconds: number) {
    const on = amount > 0.001;
    try {
      graph.driveIn.disconnect();
    } catch {
      /* noop */
    }
    if (on) {
      graph.shaper.curve = makeDriveCurve(amount);
      graph.driveIn.connect(graph.shaper);
      graph.shaper.connect(graph.driveOut);
    } else {
      try {
        graph.shaper.disconnect();
      } catch {
        /* noop */
      }
      graph.driveIn.connect(graph.driveOut);
    }
    this.ramp(graph.driveOut.gain, driveMakeup(amount), seconds);
  }

  private applyImpulse(graph: Graph, ctx: AudioContext, p: EffectParams, force: boolean) {
    const spec = { size: p.reverbSize, decay: p.reverbDecay, damp: p.reverbDamp };
    const key = impulseKey(spec, ctx.sampleRate);
    if (!force && key === this.currentIrKey) return;

    let buffer = this.irCache.get(key);
    if (!buffer) {
      buffer = makeImpulseResponse(ctx, spec);
      // Bounded cache: rapid preset switching reuses buffers instead of
      // re-rendering several seconds of noise on the main thread each time.
      if (this.irCache.size > 24) this.irCache.clear();
      this.irCache.set(key, buffer);
    }
    graph.convolver.buffer = buffer;
    this.currentIrKey = key;
  }

  // ── Hard bypass ───────────────────────────────────────────────────────────

  private scheduleFlush() {
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      const graph = this.graph;
      if (!graph) return;
      const p = this.params;

      if (p.delayMix <= 0) this.rebuildDelayLine(graph);
      if (p.reverbMix <= 0) this.resetConvolver(graph);
      if (isDry(p) && !this.bypassed) {
        try {
          graph.toneOut.disconnect(graph.fxInput);
        } catch {
          /* not connected */
        }
        this.bypassed = true;
      }
    }, FLUSH_DELAY_MS);
  }

  private disengageBypass() {
    const graph = this.graph;
    if (!graph || !this.bypassed) return;
    // Everything downstream is silent right now, so flushing here is click-free
    // and guarantees the first note of a re-enabled effect starts clean.
    this.rebuildDelayLine(graph);
    this.resetConvolver(graph);
    graph.toneOut.connect(graph.fxInput);
    this.bypassed = false;
  }

  /**
   * A DelayNode's internal buffer cannot be cleared, so the only way to
   * guarantee no residual echo is to replace the node. Rewiring four edges is
   * cheap and happens only while the branch is silent.
   */
  private rebuildDelayLine(graph: Graph) {
    const ctx = this.ctx;
    if (!ctx) return;
    const old = graph.delay;
    const time = old.delayTime.value;
    try {
      graph.fxSplit.disconnect(old);
    } catch {
      /* noop */
    }
    try {
      old.disconnect();
    } catch {
      /* noop */
    }
    try {
      graph.delayDamp.disconnect();
    } catch {
      /* noop */
    }
    try {
      graph.delayFb.disconnect();
    } catch {
      /* noop */
    }

    const next = ctx.createDelay(MAX_DELAY_SECONDS);
    next.delayTime.value = time;
    graph.delay = next;

    graph.fxSplit.connect(next);
    next.connect(graph.delayDamp);
    graph.delayDamp.connect(graph.delayFb);
    graph.delayFb.connect(next);
    next.connect(graph.delayReturn);
  }

  /** Reassigning the buffer resets the convolver's internal tail. */
  private resetConvolver(graph: Graph) {
    const buffer = graph.convolver.buffer;
    if (buffer) graph.convolver.buffer = buffer;
  }

  // ── Levels / output / devices ─────────────────────────────────────────────

  setMuted(muted: boolean) {
    this.patch({ muted });
    const graph = this.graph;
    if (graph) this.ramp(graph.muteGain.gain, muted ? 0 : 1, RAMP_SECONDS);
  }

  setLimiterEnabled(enabled: boolean) {
    this.patch({ limiterEnabled: enabled });
    const graph = this.graph;
    if (!graph) return;
    try {
      graph.muteGain.disconnect();
    } catch {
      /* noop */
    }
    try {
      graph.limiter.disconnect();
    } catch {
      /* noop */
    }
    if (enabled) {
      graph.muteGain.connect(graph.limiter);
      graph.limiter.connect(graph.outAnalyser);
    } else {
      graph.muteGain.connect(graph.outAnalyser);
    }
  }

  async setMicProcessing(next: Partial<MicProcessing>) {
    const merged = { ...this.snapshot.micProcessing, ...next };
    this.patch({ micProcessing: merged });

    const track = this.stream?.getAudioTracks()[0];
    if (!track) return;
    try {
      // Cheaper and safer than re-running getUserMedia: no second stream is
      // ever created, so there is nothing to leak.
      await track.applyConstraints({
        echoCancellation: merged.echoCancellation,
        noiseSuppression: merged.noiseSuppression,
        autoGainControl: merged.autoGainControl,
      });
      const settings = track.getSettings() as Partial<MicProcessing>;
      this.patch({
        appliedProcessing: {
          echoCancellation: settings.echoCancellation,
          noiseSuppression: settings.noiseSuppression,
          autoGainControl: settings.autoGainControl,
        },
      });
    } catch {
      // Browser refused live reconfiguration — restart the input cleanly.
      if (this.snapshot.status === "live") await this.restartInput();
    }
  }

  async setInputDevice(deviceId: string | null) {
    if (deviceId === this.snapshot.inputDeviceId) return;
    this.patch({ inputDeviceId: deviceId });
    if (this.snapshot.status === "live") await this.restartInput();
  }

  private async restartInput() {
    await this.stop();
    await this.start();
  }

  async setOutputDevice(deviceId: string | null) {
    this.patch({ outputDeviceId: deviceId, outputDeviceLabel: this.labelForOutput(deviceId) });
    await this.routeOutput();
  }

  private labelForOutput(deviceId: string | null): string {
    if (!deviceId || deviceId === "default") return "System default";
    const match = this.snapshot.outputDevices.find((d) => d.deviceId === deviceId);
    return match?.label ?? "Selected device";
  }

  /**
   * The only place a sink is attached. It always disconnects first, so the
   * graph can never end up with two monitoring paths.
   */
  private async routeOutput(): Promise<void> {
    const graph = this.graph;
    const ctx = this.ctx;
    if (!graph || !ctx) return;

    const wanted = this.snapshot.outputDeviceId;
    const useElement = Boolean(wanted) && wanted !== "default" && supportsSinkId();

    try {
      graph.outAnalyser.disconnect();
    } catch {
      /* noop */
    }

    if (!useElement) {
      this.teardownElementRoute();
      graph.outAnalyser.connect(ctx.destination);
      this.patch({ outputRoute: "direct" });
      return;
    }

    try {
      const dest = this.streamDest ?? ctx.createMediaStreamDestination();
      this.streamDest = dest;

      let el = this.audioEl;
      if (!el) {
        el = new Audio();
        el.autoplay = true;
        // Kept out of the DOM on purpose: one engine-owned element, impossible
        // to duplicate and nothing for the page to accidentally render twice.
        this.audioEl = el;
      }
      el.srcObject = dest.stream;
      await (el as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(
        wanted!,
      );
      await el.play();

      graph.outAnalyser.connect(dest);
      this.patch({ outputRoute: "element" });
    } catch (e) {
      this.teardownElementRoute();
      graph.outAnalyser.connect(ctx.destination);
      this.patch({
        outputRoute: "direct",
        outputDeviceId: null,
        outputDeviceLabel: "System default",
        error: {
          kind: "output-route",
          message: "That output device could not be opened.",
          hint: e instanceof Error ? e.message : undefined,
        },
      });
    }
  }

  private teardownElementRoute() {
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.srcObject = null;
      this.audioEl = null;
    }
    if (this.streamDest) {
      try {
        this.streamDest.disconnect();
      } catch {
        /* noop */
      }
      this.streamDest = null;
    }
  }

  async refreshDevices(): Promise<void> {
    if (!supportsDeviceSelection()) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs: DeviceInfo[] = [];
      const outputs: DeviceInfo[] = [];
      let inIdx = 0;
      let outIdx = 0;
      for (const d of devices) {
        if (d.kind === "audioinput") {
          inIdx++;
          inputs.push({ deviceId: d.deviceId, label: d.label || `Microphone ${inIdx}` });
        } else if (d.kind === "audiooutput") {
          outIdx++;
          outputs.push({ deviceId: d.deviceId, label: d.label || `Output ${outIdx}` });
        }
      }
      this.patch({
        inputDevices: inputs,
        outputDevices: outputs,
        outputDeviceLabel: this.labelForOutputIn(outputs, this.snapshot.outputDeviceId),
      });

      // The selected input vanished (unplugged headset, etc.).
      const selected = this.snapshot.inputDeviceId;
      if (selected && !inputs.some((d) => d.deviceId === selected)) {
        this.patch({ inputDeviceId: null });
      }
    } catch {
      /* enumeration can reject in locked-down contexts */
    }
  }

  private labelForOutputIn(outputs: DeviceInfo[], deviceId: string | null): string {
    if (!deviceId || deviceId === "default") return "System default";
    return outputs.find((d) => d.deviceId === deviceId)?.label ?? "Selected device";
  }

  private startMetering() {
    if (this.rafId !== null) return;
    const loop = () => {
      this.rafId = requestAnimationFrame(loop);
      this.measure();
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private stopMetering() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private measure() {
    const graph = this.graph;
    if (!graph || this.levelListeners.size === 0) return;

    const now = performance.now();
    const input = readAnalyser(graph.inputAnalyser, this.inBuf);
    const output = readAnalyser(graph.outAnalyser, this.outBuf);

    this.holdIn = input.peak > this.holdIn ? input.peak : this.holdIn * 0.965;
    this.holdOut = output.peak > this.holdOut ? output.peak : this.holdOut * 0.965;
    if (input.peak >= CLIP_THRESHOLD) this.clipInUntil = now + CLIP_HOLD_MS;
    if (output.peak >= CLIP_THRESHOLD) this.clipOutUntil = now + CLIP_HOLD_MS;

    this.levels = {
      inRms: toDb(input.rms),
      inPeak: toDb(input.peak),
      outRms: toDb(output.rms),
      outPeak: toDb(output.peak),
      inHold: toDb(this.holdIn),
      outHold: toDb(this.holdOut),
      inClip: now < this.clipInUntil,
      outClip: now < this.clipOutUntil,
    };
    for (const l of this.levelListeners) l(this.levels);
  }
}

function readAnalyser(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>) {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i];
    sum += v * v;
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
  }
  return { rms: Math.sqrt(sum / buf.length), peak };
}

function dampToHz(damp: number): number {
  // damp 0 -> 12 kHz (bright repeats), damp 1 -> 900 Hz (dark repeats)
  return 900 + (1 - clamp01(damp)) * 11100;
}

function msOrNull(seconds: number | undefined): number | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.round(seconds * 1000);
}

function describeGumError(e: unknown): EngineError {
  const name = e instanceof Error ? e.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        kind: "permission-denied",
        message: "Microphone access was blocked.",
        hint: "Open the padlock or camera icon in the address bar, allow the microphone, then start again.",
      };
    case "NotFoundError":
    case "OverconstrainedError":
      return {
        kind: "no-device",
        message: "No microphone was found.",
        hint: "Connect a microphone or headset and try again.",
      };
    case "NotReadableError":
    case "AbortError":
      return {
        kind: "device-in-use",
        message: "The microphone is already in use by another app.",
        hint: "Close other apps or tabs using the mic, then start again.",
      };
    default:
      return {
        kind: "unknown",
        message: e instanceof Error ? e.message : String(e),
      };
  }
}

// One engine per page. Module scope guarantees React StrictMode's double mount
// reuses the same instance instead of building a second graph.
let singleton: AudioEngine | null = null;

export function getEngine(): AudioEngine | null {
  if (typeof window === "undefined") return null;
  if (!singleton) singleton = new AudioEngine();
  return singleton;
}
