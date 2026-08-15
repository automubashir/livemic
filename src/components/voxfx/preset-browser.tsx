import { useMemo, useState } from "react";

import { DRY_PARAMS, isDry } from "@/lib/audio/params";
import {
  GROUP_NOTES,
  GROUP_ORDER,
  PRESETS,
  type Preset,
  type PresetGroup,
} from "@/lib/audio/presets";

type Props = {
  activeId: string;
  dirty: boolean;
  onSelect: (preset: Preset) => void;
};

/** Resolved once at module load — presets are static data. */
const SIGNATURES = new Map<string, { tags: string[]; dry: boolean }>(
  PRESETS.map((preset) => {
    const p = { ...DRY_PARAMS, ...preset.params };
    const tags: string[] = [];
    if (p.reverbMix > 0) tags.push("RVB");
    if (p.delayMix > 0) tags.push("ECHO");
    if (p.chorusMix > 0) tags.push("MOD");
    if (p.drive > 0) tags.push("DRV");
    return [preset.id, { tags, dry: isDry(p) }];
  }),
);

export function PresetBrowser({ activeId, dirty, onSelect }: Props) {
  const activePreset = useMemo(() => PRESETS.find((p) => p.id === activeId), [activeId]);
  const [group, setGroup] = useState<PresetGroup>(activePreset?.group ?? "Speech");

  const items = useMemo(() => PRESETS.filter((p) => p.group === group), [group]);

  return (
    <section className="rounded-lg border border-vx-line bg-vx-panel">
      <div className="flex items-center justify-between gap-3 border-b border-vx-line px-3.5 py-2.5">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-vx-faint">
          Presets
        </h2>
        <span className="truncate text-[10px] text-vx-dim">
          {activePreset?.name ?? "—"}
          {dirty && <span className="ml-1 text-vx-accent">· edited</span>}
        </span>
      </div>

      <div className="vx-scrollbar flex gap-1 overflow-x-auto border-b border-vx-line px-2 py-2">
        {GROUP_ORDER.map((g) => {
          const on = g === group;
          return (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g)}
              aria-pressed={on}
              className={`shrink-0 rounded px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                on
                  ? "bg-vx-raise text-vx-text ring-1 ring-inset ring-vx-line-strong"
                  : "text-vx-faint hover:bg-vx-raise/50 hover:text-vx-dim"
              }`}
            >
              {g}
              {activePreset?.group === g && (
                <span className="ml-1.5 inline-block h-1 w-1 rounded-full bg-vx-accent align-middle" />
              )}
            </button>
          );
        })}
      </div>

      <div className="px-3.5 pt-2.5">
        <p className="text-[10px] text-vx-faint">{GROUP_NOTES[group]}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 p-3.5 pt-2 xl:grid-cols-3">
        {items.map((preset) => {
          const sig = SIGNATURES.get(preset.id)!;
          const active = preset.id === activeId;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelect(preset)}
              aria-pressed={active}
              className={`group rounded-md border p-2.5 text-left transition-colors ${
                active
                  ? "border-vx-accent/60 bg-vx-accent/10"
                  : "border-vx-line bg-vx-raise/40 hover:border-vx-line-strong hover:bg-vx-raise"
              }`}
            >
              <div className="flex items-start justify-between gap-1.5">
                <span
                  className={`text-[12.5px] font-semibold leading-tight ${
                    active ? "text-vx-accent" : "text-vx-text"
                  }`}
                >
                  {preset.name}
                </span>
                {active && (
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-vx-accent" />
                )}
              </div>
              <p className="mt-1 text-[10px] leading-snug text-vx-faint">{preset.hint}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {sig.dry ? (
                  <span className="rounded-sm bg-vx-ok/15 px-1 py-px text-[8.5px] font-semibold tracking-wider text-vx-ok">
                    DRY
                  </span>
                ) : (
                  sig.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-sm bg-vx-sunk px-1 py-px text-[8.5px] font-semibold tracking-wider text-vx-dim"
                    >
                      {tag}
                    </span>
                  ))
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
