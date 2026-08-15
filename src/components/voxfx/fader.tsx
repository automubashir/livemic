import { useId } from "react";

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
  /** Double-click / double-tap returns the fader here. */
  resetTo?: number;
  disabled?: boolean;
  hint?: string;
};

export function Fader({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  resetTo,
  disabled,
  hint,
}: Props) {
  const id = useId();
  const fill = max === min ? 0 : ((value - min) / (max - min)) * 100;

  return (
    <div className="select-none">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[11px] font-medium text-vx-dim">
          {label}
        </label>
        <span className="rounded bg-vx-sunk px-1.5 py-0.5 text-[10px] tabular-nums text-vx-text/80 ring-1 ring-inset ring-vx-line">
          {format(value)}
        </span>
      </div>
      <input
        id={id}
        type="range"
        className="vx-fader"
        style={{ ["--fill" as string]: fill }}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onDoubleClick={() => resetTo !== undefined && onChange(resetTo)}
      />
      {hint && <p className="-mt-0.5 text-[10px] leading-tight text-vx-faint">{hint}</p>}
    </div>
  );
}
