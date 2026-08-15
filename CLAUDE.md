# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

VoxFX — a real-time microphone effects processor running entirely in the
browser. Mic → Web Audio → live monitoring. There is no backend, no persistence
and no network I/O of any kind; audio never leaves the device.

`npm run build` produces a **static** bundle in `dist/`. Keep it that way: do not
introduce server routes, SSR, or a runtime dependency on Node/Cloudflare.

## Commands

```sh
npm run dev        # dev server on :8080
npm run build      # static build -> dist/
npm run preview    # serve dist/ locally
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run format     # prettier
```

Always run `typecheck` and `lint` before declaring work finished.

## Layout

```
src/lib/audio/       Web Audio engine — zero React
  dsp.ts             pure DSP helpers (curves, impulse responses, dB math)
  params.ts          EffectParams type, DRY_PARAMS, isDry(), ranges
  presets.ts         all 26 presets as declarative data
  engine.ts          AudioEngine class: graph, lifecycle, devices, metering
src/hooks/
  use-voxfx.ts       the only bridge from the engine to React
  use-wake-lock.ts   keeps the screen awake while live
src/components/voxfx/  console UI (meters, faders, preset browser, rack)
src/routes/index.tsx   page layout
src/components/ui/     shadcn scaffolding, mostly unused — see Gotchas
```

## Audio rules — do not violate these

The engine exists because the previous implementation shipped a phantom echo.
Three defects caused it: a second `AudioContext` from a double-tapped Start
button, a UI that displayed "Clean" while running wet default parameters, and a
non-unity waveshaper. The current design makes all three structurally
impossible. Preserve that.

1. **One `AudioContext` per page.** Created lazily in `ensureContext()`, never
   replaced. `stop()` suspends it; only `destroy()` closes it.
2. **One `MediaStream` + one source node.** Held in single fields that
   `detachStream()` always clears before reassignment.
3. **One sink.** `outAnalyser` is the only node that connects to a destination,
   and `routeOutput()` calls `disconnect()` before connecting exactly one
   target. Never add a second path to `ctx.destination`.
4. **Build the graph once.** Presets and sliders write `AudioParam`s via
   `applyParams()`. Never construct nodes in a React render or effect.
5. **Dry is structural, not cosmetic.** When `isDry(params)` is true the FX
   branch is disconnected from the tone chain, the `DelayNode` is replaced (its
   buffer cannot be cleared any other way) and the convolver tail is reset. The
   `DRY SIGNAL` badge reads the same predicate, so it can never lie.
6. **Ramp, don't jump.** Use the engine's `ramp()` helper for parameter changes
   so nothing clicks.
7. **Guard async lifecycle.** `start()`/`stop()` assign their guard promise
   _before_ any `await`, and a `generation` counter invalidates an in-flight
   `getUserMedia` if `stop()` lands first.

Adding a new effect means: add fields to `EffectParams` and `DRY_PARAMS`, wire
the nodes once in `buildGraph()`, ramp them in `applyParams()`, and include the
return in `isDry()`. If a new effect's return is not covered by `isDry()`, dry
mode silently breaks.

## React rules

- The engine is the source of truth. React holds no audio state that could drift
  from the graph — `useVoxFX` exposes it through `useSyncExternalStore`.
- StrictMode is **on** and must stay on; it is what proves the double-mount
  guarantees still hold. The engine is a module-level singleton (`getEngine()`)
  for the same reason.
- Meters paint straight to the DOM from `subscribeLevels`. Never route 60 Hz
  level data through React state.

## Verifying audio changes

There is no test runner configured. Audio-graph changes cannot be validated by
typecheck alone, so verify behaviour explicitly:

- Manually: Clean must be silent of effects; Start/Stop five times must not get
  louder or doubled; switching presets rapidly must not accumulate effects;
  Dry → Echo → Dry must leave no tail.
- The diagnostics panel reports active stream and context counts — both must
  read `1` while live and `0` streams after Stop.
- The graph invariants are mechanically checkable by driving `AudioEngine`
  against a mock Web Audio API in Node (assert reachability from the source
  node, and the edge count into the destination). Consider adding Vitest and
  committing such a harness; the invariants above are exactly what it should
  assert.

## Conventions

- Prettier: 100 columns, double quotes, semicolons, trailing commas. Run
  `npm run format` on files you touch.
- Tailwind v4. The console palette is defined as `--vx-*` custom properties in
  `src/styles.css` and registered in `@theme inline` as `--color-vx-*`, so use
  `bg-vx-panel`, `text-vx-dim` and friends rather than raw hex. Colours are
  oklch.
- Page metadata is static in `/index.html`, not in route `head()` options.
- `src/routeTree.gen.ts` is generated by `@tanstack/router-plugin`; never edit
  it, and leave it out of lint/format.

## Gotchas

- **Line endings.** Pre-existing files are CRLF and fail `prettier/prettier`
  under `npm run lint`; files added since are LF and pass. `npm run lint` on the
  whole repo is therefore noisy — lint the paths you changed. Do not mass-convert
  line endings unless asked; it buries real diffs.
- **`src/components/ui/`** is shadcn scaffolding. The VoxFX UI does not use it,
  but it is kept for future work and it inflates the generated CSS. Deleting it
  is a deliberate decision, not a cleanup.
- **Secure context required.** `getUserMedia` fails over plain HTTP; use
  `localhost` or HTTPS.
- **Do not "fix" feedback in software.** Acoustic feedback is a room problem.
  Never mask it by lowering gains, gating, or filtering behind the user's back —
  the app explains the difference instead.
