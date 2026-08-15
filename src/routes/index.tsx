import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { Diagnostics } from "@/components/voxfx/diagnostics";
import { EffectsRack } from "@/components/voxfx/effects-rack";
import { Fader } from "@/components/voxfx/fader";
import { LevelMeter } from "@/components/voxfx/level-meter";
import { DeviceSelect, Panel, Toggle } from "@/components/voxfx/panel";
import { PresetBrowser } from "@/components/voxfx/preset-browser";
import { useVoxFX } from "@/hooks/use-voxfx";
import { useWakeLock } from "@/hooks/use-wake-lock";
import type { EngineSnapshot } from "@/lib/audio/engine";
import { PARAM_RANGES } from "@/lib/audio/params";

// Page metadata is static and lives in index.html so crawlers get it without
// executing any JavaScript.
export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const vx = useVoxFX();
  const s = vx.snapshot;
  const live = s.status === "live";
  const busy = s.status === "initializing" || s.status === "stopping";
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  useWakeLock(live);

  return (
    <div className="min-h-screen bg-vx-bg text-vx-text antialiased">
      <Header snapshot={s} />

      <main className="mx-auto max-w-[1400px] px-3 pb-32 pt-3 sm:px-4">
        {!noticeDismissed && <FeedbackNotice onDismiss={() => setNoticeDismissed(true)} />}
        {s.error && <ErrorNotice snapshot={s} onDismiss={vx.clearError} />}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[300px_minmax(0,1fr)_330px] xl:items-start">
          <div className="space-y-3">
            <Panel
              title="Input"
              meta={
                <span className="truncate text-[10px] text-vx-dim">
                  {s.inputDeviceLabel ?? (live ? "Default microphone" : "not open")}
                </span>
              }
            >
              <LevelMeter engine={vx.engine} channel="input" label="Mic level" />
              <div className="mt-4">
                <Fader
                  label="Input gain"
                  value={s.params.inputGain}
                  {...PARAM_RANGES.inputGain}
                  onChange={(v) => vx.setParam("inputGain", v)}
                  format={(v) => `${v.toFixed(2)}×`}
                  resetTo={1}
                />
              </div>

              {s.deviceSelectionSupported && (
                <div className="mt-4">
                  <DeviceSelect
                    label="Microphone"
                    value={s.inputDeviceId ?? ""}
                    options={s.inputDevices}
                    onChange={(id) => void vx.setInputDevice(id || null)}
                    emptyLabel="System default"
                  />
                  {s.permission !== "granted" && s.inputDevices.length === 0 && (
                    <p className="mt-1 text-[10px] leading-tight text-vx-faint">
                      Device names appear after microphone access is granted.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-4 border-t border-vx-line pt-2">
                <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-vx-faint">
                  Browser mic processing
                </p>
                <p className="mb-1.5 text-[10px] leading-snug text-vx-faint">
                  Off by default for live effects — these are voice-call algorithms that fight
                  intentional reverb and echo.
                </p>
                <Toggle
                  label="Echo cancellation"
                  description="Suppresses sound the browser thinks is feedback."
                  checked={s.micProcessing.echoCancellation}
                  onChange={(v) => void vx.setMicProcessing({ echoCancellation: v })}
                />
                <Toggle
                  label="Noise suppression"
                  description="Removes steady background noise."
                  checked={s.micProcessing.noiseSuppression}
                  onChange={(v) => void vx.setMicProcessing({ noiseSuppression: v })}
                />
                <Toggle
                  label="Auto gain control"
                  description="Lets the browser ride your input level."
                  checked={s.micProcessing.autoGainControl}
                  onChange={(v) => void vx.setMicProcessing({ autoGainControl: v })}
                />
              </div>
            </Panel>

            <Panel
              title="Output"
              meta={<span className="truncate text-[10px] text-vx-dim">{s.outputDeviceLabel}</span>}
            >
              <LevelMeter engine={vx.engine} channel="output" label="Output level" />
              <div className="mt-4">
                <Fader
                  label="Output level"
                  value={s.params.outputGain}
                  {...PARAM_RANGES.outputGain}
                  onChange={(v) => vx.setParam("outputGain", v)}
                  format={(v) => `${v.toFixed(2)}×`}
                  resetTo={1}
                />
              </div>

              <button
                type="button"
                onClick={() => vx.setMuted(!s.muted)}
                aria-pressed={s.muted}
                className={`mt-3 w-full rounded border py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                  s.muted
                    ? "border-vx-live/50 bg-vx-live/15 text-vx-live"
                    : "border-vx-line bg-vx-raise/50 text-vx-dim hover:text-vx-text"
                }`}
              >
                {s.muted ? "Muted" : "Mute output"}
              </button>

              <div className="mt-4">
                {s.sinkIdSupported ? (
                  <>
                    <DeviceSelect
                      label="Output device"
                      value={s.outputDeviceId ?? ""}
                      options={s.outputDevices}
                      onChange={(id) => void vx.setOutputDevice(id || null)}
                      emptyLabel="System default (lowest latency)"
                    />
                    {s.outputRoute === "element" && (
                      <p className="mt-1 text-[10px] leading-tight text-vx-faint">
                        Routed through a media element to reach the chosen device. This adds a
                        little latency — pick “System default” for the tightest monitoring.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[10px] leading-snug text-vx-faint">
                    This browser does not support choosing an output device from a web page. Audio
                    follows your system route — change it from your device's audio menu (speaker,
                    Bluetooth or wired).
                  </p>
                )}
              </div>

              <div className="mt-4 border-t border-vx-line pt-2">
                <Toggle
                  label="Output limiter"
                  description="Catches peaks just below clipping."
                  checked={s.limiterEnabled}
                  onChange={vx.setLimiterEnabled}
                />
              </div>
            </Panel>
          </div>

          <div className="space-y-3">
            <PresetBrowser activeId={s.presetId} dirty={s.presetDirty} onSelect={vx.selectPreset} />
          </div>

          <div className="space-y-3 md:col-span-2 xl:col-span-1">
            <EffectsRack
              params={s.params}
              dry={s.dry}
              onChange={vx.setParam}
              onToggleBypass={vx.toggleFxBypass}
            />
            <Diagnostics engine={vx.engine} snapshot={s} />
            <p className="px-1 text-[10px] leading-relaxed text-vx-faint">
              Reverb and echo are independent sends. When a preset sets them to zero the effect
              branch is physically disconnected from the signal path — not just turned down.
            </p>
          </div>
        </div>
      </main>

      <Transport
        snapshot={s}
        live={live}
        busy={busy}
        onToggle={() => void vx.toggle()}
        onMute={() => vx.setMuted(!s.muted)}
      />
    </div>
  );
}

function Header({ snapshot: s }: { snapshot: EngineSnapshot }) {
  const live = s.status === "live";
  return (
    <header className="sticky top-0 z-20 border-b border-vx-line bg-vx-bg/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded border border-vx-line-strong bg-vx-raise text-[11px] font-bold tracking-tight text-vx-accent">
            VX
          </span>
          <div className="leading-none">
            <h1 className="text-[15px] font-semibold tracking-tight">VoxFX</h1>
            <p className="mt-0.5 text-[10px] text-vx-faint">Live vocal processor</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Chip tone={live ? "live" : "idle"}>
            {live ? (
              <>
                <span className="vx-pulse mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-vx-live align-middle" />
                LIVE
              </>
            ) : (
              "MIC OFF"
            )}
          </Chip>

          <Chip tone={s.dry ? "ok" : "accent"}>
            {s.dry ? "DRY SIGNAL" : s.activeEffectNames.join(" · ").toUpperCase()}
          </Chip>

          <Chip tone="idle" className="hidden sm:inline-flex">
            {describeLatency(s)}
          </Chip>

          <Chip tone="idle" className="hidden max-w-[200px] truncate md:inline-flex">
            Output: {s.outputDeviceLabel}
          </Chip>
        </div>
      </div>
    </header>
  );
}

function Chip({
  children,
  tone,
  className = "",
}: {
  children: ReactNode;
  tone: "live" | "idle" | "ok" | "accent";
  className?: string;
}) {
  const tones = {
    live: "bg-vx-live/12 text-vx-live ring-vx-live/30",
    idle: "bg-vx-raise/60 text-vx-dim ring-vx-line",
    ok: "bg-vx-ok/12 text-vx-ok ring-vx-ok/30",
    accent: "bg-vx-accent/12 text-vx-accent ring-vx-accent/30",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] ring-1 ring-inset ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

function describeLatency(s: EngineSnapshot): string {
  if (s.status !== "live") return "Interactive latency requested";
  const total =
    s.baseLatencyMs === null && s.outputLatencyMs === null
      ? null
      : (s.baseLatencyMs ?? 0) + (s.outputLatencyMs ?? 0);
  if (total === null) return "Low-latency monitoring";
  return `Low-latency monitoring · ~${total} ms reported`;
}

function FeedbackNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="mb-3 rounded-lg border border-vx-warn/25 bg-vx-warn/[0.06] p-3.5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-vx-warn">
            Before you go live
          </h2>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-vx-dim">
            Use headphones, or keep the speaker well away from the microphone. If the mic can hear
            the speaker, the sound loops back into itself and builds into a howl. That is{" "}
            <strong className="font-semibold text-vx-text">acoustic feedback</strong> — it happens
            in the room, not in the app, and no software setting can remove it while the loop
            exists. Lowering output level, moving the speaker, or switching to headphones will.
          </p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-vx-faint">
            Repeats you hear with a dry preset selected and the DRY SIGNAL badge lit are not
            produced by this processor — check the Audio Diagnostics panel for what is actually
            active.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded border border-vx-line bg-vx-raise/60 px-2.5 py-1 text-[10px] font-medium text-vx-dim hover:text-vx-text"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function ErrorNotice({
  snapshot: s,
  onDismiss,
}: {
  snapshot: EngineSnapshot;
  onDismiss: () => void;
}) {
  if (!s.error) return null;
  return (
    <div role="alert" className="mb-3 rounded-lg border border-vx-live/30 bg-vx-live/[0.07] p-3.5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-vx-live">
            {s.error.kind === "permission-denied" ? "Microphone access required" : "Audio problem"}
          </h2>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-vx-text">{s.error.message}</p>
          {s.error.hint && (
            <p className="mt-1 text-[11.5px] leading-relaxed text-vx-dim">{s.error.hint}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded border border-vx-line bg-vx-raise/60 px-2.5 py-1 text-[10px] font-medium text-vx-dim hover:text-vx-text"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function Transport({
  snapshot: s,
  live,
  busy,
  onToggle,
  onMute,
}: {
  snapshot: EngineSnapshot;
  live: boolean;
  busy: boolean;
  onToggle: () => void;
  onMute: () => void;
}) {
  const denied = s.permission === "denied";
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-vx-line bg-vx-bg/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-4">
        <div className="hidden min-w-0 flex-1 sm:block">
          <p className="truncate text-[11px] font-medium text-vx-text">
            {live ? "Monitoring live" : denied ? "Microphone blocked" : "Ready"}
          </p>
          <p className="truncate text-[10px] text-vx-faint">
            {live
              ? `${s.dry ? "Dry signal" : s.activeEffectNames.join(", ")} · ${s.outputDeviceLabel}`
              : denied
                ? "Allow the microphone in your browser's site settings, then start again."
                : "Allow microphone access to start live monitoring."}
          </p>
        </div>

        <button
          type="button"
          onClick={onMute}
          aria-pressed={s.muted}
          disabled={!live}
          className={`hidden h-12 shrink-0 rounded-lg border px-4 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors disabled:opacity-40 sm:block ${
            s.muted
              ? "border-vx-live/50 bg-vx-live/15 text-vx-live"
              : "border-vx-line bg-vx-raise/60 text-vx-dim hover:text-vx-text"
          }`}
        >
          {s.muted ? "Unmute" : "Mute"}
        </button>

        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          className={`h-12 flex-1 rounded-lg text-[13px] font-semibold uppercase tracking-[0.12em] transition-colors disabled:opacity-60 sm:max-w-[260px] ${
            live
              ? "bg-vx-live text-black hover:brightness-110"
              : "bg-vx-accent text-black hover:brightness-110"
          }`}
        >
          {busy ? "Working…" : live ? "Stop microphone" : "Start microphone"}
        </button>
      </div>
    </div>
  );
}
