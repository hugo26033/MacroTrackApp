"use client";

import React, { useState } from "react";
import type { WeightPointWithTrends } from "@/lib/types";

export function WeightTrendChart({ data }: { data: WeightPointWithTrends[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-sm text-zinc-500">
        Aucune pesée enregistrée sur cette période.
      </div>
    );
  }

  const width = 640;
  const height = 220;
  const padL = 42;
  const padR = 16;
  const padT = 18;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const allVals = data.flatMap((d) =>
    [d.weightKg, d.ma3, d.ma5].filter((v): v is number => v !== null)
  );
  const minVal = Math.floor((Math.min(...allVals) - 0.5) * 10) / 10;
  const maxVal = Math.ceil((Math.max(...allVals) + 0.5) * 10) / 10;
  const span = Math.max(0.5, maxVal - minVal);

  const xAt = (i: number) =>
    data.length === 1 ? padL + plotW / 2 : padL + (i / (data.length - 1)) * plotW;
  const yAt = (v: number) => padT + ((maxVal - v) / span) * plotH;

  const makePath = (vals: (number | null)[]) =>
    vals
      .map((v, i) => (v === null ? null : `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`))
      .filter(Boolean)
      .join(" ");

  const rawPath = makePath(data.map((d) => d.weightKg));
  const ma3Path = makePath(data.map((d) => d.ma3));
  const ma5Path = makePath(data.map((d) => d.ma5));

  const yTicks = [minVal, minVal + span / 2, maxVal].map((v) => Math.round(v * 10) / 10);
  const activePoint = hoverIdx !== null ? data[hoverIdx] : data[data.length - 1];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-zinc-400">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-400 inline-block" /> Brut
          </span>
          <span className="inline-flex items-center gap-1.5 text-emerald-400">
            <span className="w-3 h-0.5 bg-emerald-400 inline-block" /> Tendance 3j
          </span>
          <span className="inline-flex items-center gap-1.5 text-sky-400">
            <span className="w-3 h-0.5 bg-sky-400 inline-block" /> Tendance 5j
          </span>
        </div>
        {activePoint && (
          <div className="font-mono text-zinc-300">
            {activePoint.logDate.slice(5)} · Brut <strong>{activePoint.weightKg} kg</strong> · 3j{" "}
            <strong className="text-emerald-400">{activePoint.ma3 ?? "-"}</strong> · 5j{" "}
            <strong className="text-sky-400">{activePoint.ma5 ?? "-"}</strong>
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-52 overflow-visible select-none"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={padL}
              x2={width - padR}
              y1={yAt(tick)}
              y2={yAt(tick)}
              stroke="currentColor"
              className="text-zinc-800 dark:text-zinc-800"
              strokeDasharray="3 3"
            />
            <text
              x={padL - 8}
              y={yAt(tick) + 4}
              textAnchor="end"
              className="fill-zinc-500 text-[10px] font-mono"
            >
              {tick.toFixed(1)}
            </text>
          </g>
        ))}

        <path d={rawPath} fill="none" stroke="#71717a" strokeWidth="1.5" strokeOpacity="0.45" />
        <path d={ma5Path} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
        <path d={ma3Path} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />

        {data.map((d, i) => (
          <g key={d.logDate}>
            <circle
              cx={xAt(i)}
              cy={yAt(d.weightKg)}
              r={hoverIdx === i ? 5 : 3}
              className="fill-zinc-300 stroke-zinc-900"
              strokeWidth="1.5"
            />
            <rect
              x={xAt(i) - plotW / Math.max(1, data.length) / 2}
              y={padT}
              width={Math.max(12, plotW / Math.max(1, data.length))}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
            />
            {(i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)) && (
              <text
                x={xAt(i)}
                y={height - 6}
                textAnchor="middle"
                className="fill-zinc-500 text-[10px] font-mono"
              >
                {d.logDate.slice(5)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export function BarHistoryChart({
  data,
  target,
  unit,
  barColorClass = "fill-emerald-500",
}: {
  data: { label: string; value: number; date: string }[];
  target?: number;
  unit: string;
  barColorClass?: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="h-44 flex items-center justify-center text-sm text-zinc-500">
        Aucune donnée disponible.
      </div>
    );
  }

  const width = 640;
  const height = 180;
  const padL = 46;
  const padR = 12;
  const padT = 16;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxData = Math.max(...data.map((d) => d.value), target ?? 0, 10);
  const maxVal = Math.ceil(maxData * 1.12);
  const yAt = (v: number) => padT + ((maxVal - v) / maxVal) * plotH;
  const stepW = plotW / data.length;
  const barW = Math.max(4, Math.min(28, stepW * 0.65));

  const active = hoverIdx !== null ? data[hoverIdx] : data[data.length - 1];

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-xs text-zinc-400">
        <span>
          {target ? `Objectif : ${target.toLocaleString("fr-FR")} ${unit}` : ""}
        </span>
        {active && (
          <span className="font-mono text-zinc-300">
            {active.label} : <strong>{active.value.toLocaleString("fr-FR")}</strong> {unit}
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-44 overflow-visible select-none"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {target !== undefined && target > 0 && (
          <line
            x1={padL}
            x2={width - padR}
            y1={yAt(target)}
            y2={yAt(target)}
            stroke="#f59e0b"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
        )}

        <text x={padL - 6} y={padT + 8} textAnchor="end" className="fill-zinc-500 text-[10px] font-mono">
          {maxVal.toLocaleString("fr-FR")}
        </text>
        <text x={padL - 6} y={padT + plotH} textAnchor="end" className="fill-zinc-500 text-[10px] font-mono">
          0
        </text>

        {data.map((d, i) => {
          const x = padL + i * stepW + (stepW - barW) / 2;
          const y = yAt(d.value);
          const h = Math.max(2, padT + plotH - y);
          const showLabel =
            data.length <= 10 || i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 6) === 0;
          return (
            <g key={d.date + i} onMouseEnter={() => setHoverIdx(i)}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={3}
                className={`${barColorClass} ${hoverIdx === i ? "opacity-100" : "opacity-80"} transition-opacity`}
              />
              {showLabel && (
                <text
                  x={x + barW / 2}
                  y={height - 6}
                  textAnchor="middle"
                  className="fill-zinc-500 text-[10px] font-mono"
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
