"use client";
import type { ReactNode } from "react";
import { useState } from "react";
export const field =
  "mt-1 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";
export function Label({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 text-[11px] font-medium text-slate-500">
      {name}
      {children}
    </label>
  );
}
export function NumberControl({
  name,
  value,
  min,
  max,
  step = 0.1,
  onChange,
}: {
  name: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState<string>();
  return (
    <Label name={name}>
      <input
        aria-label={name}
        className={field}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft ?? value}
        onFocus={() => setDraft(String(value))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (e.target.value.trim() && Number.isFinite(n))
            onChange(Math.max(min, Math.min(max, n)));
          setDraft(undefined);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            e.currentTarget.value = String(value);
            e.currentTarget.blur();
          }
        }}
      />
    </Label>
  );
}
