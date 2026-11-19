"use client";

import React, { useState } from "react";

interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  value: number;
  onValueChange: (val: number) => void;
  min?: number;
  max?: number;
  fallback?: number;
}

/**
 * Controlled numeric input that lets users clear the field completely while typing
 * (avoiding the stuck leading "0" or "1" on mobile/React) and clamps only on blur.
 */
export function NumberInput({
  value,
  onValueChange,
  min,
  max,
  fallback,
  onFocus,
  onBlur,
  ...rest
}: NumberInputProps) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState<string>(String(value));

  function clamp(num: number): number {
    let n = num;
    if (min !== undefined && n < min) n = min;
    if (max !== undefined && n > max) n = max;
    return n;
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setRaw(next);

    if (next.trim() === "" || next === "-" || next === "." || next === ",") {
      return;
    }

    const parsed = Number(next.replace(",", "."));
    if (Number.isFinite(parsed)) {
      onValueChange(clamp(parsed));
    }
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    setFocused(false);
    const trimmed = raw.trim();
    const parsed = Number(trimmed.replace(",", "."));
    if (trimmed === "" || !Number.isFinite(parsed)) {
      const safe = clamp(fallback ?? min ?? 0);
      setRaw(String(safe));
      onValueChange(safe);
    } else {
      const clamped = clamp(parsed);
      setRaw(String(clamped));
      onValueChange(clamped);
    }
    onBlur?.(e);
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode={rest.step && String(rest.step).includes(".") ? "decimal" : "numeric"}
      value={focused ? raw : String(value)}
      onChange={handleChange}
      onFocus={(e) => {
        setRaw(String(value));
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={handleBlur}
    />
  );
}
