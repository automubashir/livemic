# VoxFX

A real-time microphone effects processor that runs entirely in the browser.

Microphone → Web Audio processing → live monitoring through headphones,
Bluetooth, wired output or a speaker. No accounts, no uploads, no server: audio
never leaves the device.

## Features

- **26 presets** across Speech, Karaoke, Singing, Mehfil, Qawwali, Tillawat,
  Naat and FX — every one a declarative parameter set, not bespoke code.
- **Guaranteed dry mode.** When no effect return is open, the effect branch is
  physically disconnected from the signal path and the delay line is rebuilt.
  The `DRY SIGNAL` badge is driven by the same predicate as the bypass, so it
  cannot disagree with the graph.
- **Independent sends** for reverb, echo and chorus, so a preset can have a long
  reverb tail with zero echo.
- **Real level meters** — RMS + peak hold + clip detection from `AnalyserNode`
  data, not animations.
- **Low-latency monitoring** via `latencyHint: "interactive"`, with the
  browser-reported latency shown when it is actually available.
- **Device selection** for input, and for output where the browser supports
  `setSinkId`.
- **Audio diagnostics panel** exposing context state, sample rate, stream and
  context counts, the applied microphone constraints, and live levels.

## Requirements

A modern browser (Chrome, Edge, Firefox or Safari) and a **secure context** —
`https://` or `localhost`. `getUserMedia` is unavailable over plain HTTP.

## Development

```sh
npm install
npm run dev      # http://localhost:8080
```

| Script              | Purpose                              |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Dev server with HMR                  |
| `npm run build`     | Static production build into `dist/` |
| `npm run preview`   | Serve the built `dist/` locally      |
| `npm run typecheck` | `tsc --noEmit`                       |
| `npm run lint`      | ESLint                               |
| `npm run format`    | Prettier                             |

## Deploying

`npm run build` emits a plain static bundle in `dist/` — HTML, JS, CSS and
icons, with no server runtime. Upload it to any static host (Netlify, Vercel,
Cloudflare Pages, GitHub Pages, S3, nginx).

Two things to configure on the host:

1. **Serve over HTTPS.** The microphone will not open otherwise.
2. **SPA fallback.** Rewrite unknown paths to `/index.html` so client-side
   routing works on a hard refresh. On Netlify that is `/* /index.html 200`;
   nginx uses `try_files $uri $uri/ /index.html;`.

## Audio architecture

All Web Audio code lives in [`src/lib/audio/`](src/lib/audio/) and is fully
separated from React. The engine owns one `AudioContext` and one graph for the
lifetime of the page; the UI only ever writes parameters.

```
mic -> source -> inputGain -+-> inputAnalyser (metering tap)
                            +-> lowCut -> eqLow -> eqMid -> eqHigh = toneOut

toneOut -+-> dryGain -----------------------------------------------> mixBus
         +-> fxInput(wet) -> drive -> +-> delay   -> delayReturn  --> mixBus
                                      +-> chorus  -> chorusReturn --> mixBus
                                      +-> reverb  -> reverbReturn --> mixBus

mixBus -> master -> mute -> [limiter] -> outAnalyser -> ONE sink
```

Four invariants keep the monitor path honest:

1. One `AudioContext` per page, created lazily and never replaced.
2. One `MediaStream` and one source node, always torn down before reassignment.
3. Exactly one outgoing edge from `outAnalyser` — the only node that touches a
   sink. Routing disconnects before it connects.
4. The graph is built once; presets and sliders only write `AudioParam`s.

## Feedback: what the app can and cannot fix

If the microphone can hear the speaker, the sound loops back into itself and
builds into a howl. That is **acoustic feedback** — it happens in the room, and
no software setting removes it while the loop exists. Use headphones, move the
speaker, or lower the output level.

This is distinct from **software echo** (reverb/delay the app is generating on
purpose, shown in the header and the diagnostics panel) and from **browser
microphone processing** (echo cancellation, noise suppression and automatic gain
control, which are requested off by default because they interfere with
intentional vocal effects; all three are togglable in the Input panel).

## Tech stack

Vite · React 19 · TypeScript · TanStack Router (client-side) · Tailwind CSS v4 ·
Web Audio API.
