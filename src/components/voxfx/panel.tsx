import type { ReactNode } from "react";

/** A rack unit: hairline border, sunken header, no decorative gradients. */
export function Panel({
  title,
  meta,
  children,
  className = "",
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-vx-line bg-vx-panel ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-vx-line px-3.5 py-2.5">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-vx-faint">
          {title}
        </h2>
        {meta}
      </div>
      <div className="p-3.5">{children}</div>
    </section>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 py-1.5 text-left disabled:opacity-45"
    >
      <span className="min-w-0">
        <span className="block text-[11px] text-vx-dim">{label}</span>
        {description && (
          <span className="block text-[10px] leading-tight text-vx-faint">{description}</span>
        )}
      </span>
      <span
        className={`relative h-[18px] w-[32px] shrink-0 rounded-full transition-colors ${
          checked ? "bg-vx-accent/80" : "bg-vx-sunk ring-1 ring-inset ring-vx-line-strong"
        }`}
      >
        <span
          className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-vx-text shadow transition-[left] ${
            checked ? "left-[16px]" : "left-[2px]"
          }`}
        />
      </span>
    </button>
  );
}

export function DeviceSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  emptyLabel = "System default",
}: {
  label: string;
  value: string;
  options: { deviceId: string; label: string }[];
  onChange: (deviceId: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-vx-dim">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full truncate rounded border border-vx-line bg-vx-sunk px-2 py-1.5 text-[11px] text-vx-text outline-none focus-visible:border-vx-accent/70 focus-visible:ring-2 focus-visible:ring-vx-accent/25 disabled:opacity-45"
      >
        <option value="">{emptyLabel}</option>
        {options.map((o) => (
          <option key={o.deviceId} value={o.deviceId}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
