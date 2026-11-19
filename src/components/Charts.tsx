"use client";

import React, { useId, useState } from "react";
import { formatFrNumber } from "@/lib/calculations";
import type { WeightPointWithTrends } from "@/lib/types";

function makeSmoothPath(coords: Array<{ x: number; y: number } | null>): string {
  const pts = coords.filter((p): p is { x: number; y: number } => p !== null);
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  if (pts.length === 2) {
    return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;
  }

  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

export function WeightTrendChart({
  data,
  prevDayKcalByDate,
}: {
  data: WeightPointWithTrends[];
  prevDayKcalByDate?: Record<string, number>;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const gradId = useId();

  if (data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-zinc-500">
        Aucune pesée enregistrée sur cette période.
      </div>
    );
  }

  const width = 640;
  const height = 240;
  const padL = 44;
  const padR = 14;
  const padT = 16;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const allVals = data.flatMap((d) =>
    [d.weightKg, d.ma3, d.ma5].filter((v): v is number => v !== null)
  );
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const rawSpan = Math.max(0.2, rawMax - rawMin);
  const pad = Math.max(0.12, rawSpan * 0.14);
  const minVal = rawMin - pad;
  const maxVal = rawMax + pad;
  const span = Math.max(0.3, maxVal - minVal);

  const xAt = (i: number) =>
    data.length === 1 ? padL + plotW / 2 : padL + (i / (data.length - 1)) * plotW;
  const yAt = (v: number) => padT + ((maxVal - v) / span) * plotH;

  const rawCoords = data.map((d, i) => ({ x: xAt(i), y: yAt(d.weightKg) }));
  const ma3Coords = data.map((d, i) => (d.ma3 !== null ? { x: xAt(i), y: yAt(d.ma3) } : null));
  const ma5Coords = data.map((d, i) => (d.ma5 !== null ? { x: xAt(i), y: yAt(d.ma5) } : null));

  const rawPath = rawCoords
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const ma3Path = makeSmoothPath(ma3Coords);
  const ma5Path = makeSmoothPath(ma5Coords);

  const validMa3 = ma3Coords.filter((p): p is { x: number; y: number } => p !== null);
  const areaPath =
    validMa3.length >= 2
      ? `${ma3Path} L${validMa3[validMa3.length - 1].x.toFixed(1)},${(padT + plotH).toFixed(1)} L${validMa3[0].x.toFixed(1)},${(padT + plotH).toFixed(1)} Z`
      : "";

  const yTicks = [minVal, minVal + span / 2, maxVal].map((v) => Math.round(v * 100) / 100);
  const activeIdx = hoverIdx !== null ? hoverIdx : data.length - 1;
  const activePoint = data[activeIdx];

  function handlePointerMove(e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX : e.clientX;
    if (clientX === undefined) return;
    const relX = ((clientX - rect.left) / rect.width) * width;
    const ratio = Math.max(0, Math.min(1, (relX - padL) / plotW));
    const idx = Math.round(ratio * (data.length - 1));
    setHoverIdx(idx);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-zinc-400 inline-block" /> Brut
          </span>
          <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <span className="w-3 h-0.5 bg-emerald-500 dark:bg-emerald-400 inline-block rounded-full" /> Tendance 3j
          </span>
          <span className="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
            <span className="w-3 h-0.5 bg-sky-500 dark:bg-sky-400 inline-block rounded-full" /> Tendance 5j
          </span>
        </div>
        {activePoint && (
          <div className="font-mono text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.06] px-2.5 py-1 rounded-lg">
            {activePoint.logDate.slice(5)} · Brut <strong>{formatFrNumber(activePoint.weightKg)}</strong> · 3j{" "}
            <strong className="text-emerald-600 dark:text-emerald-400">
              {activePoint.ma3 !== null ? formatFrNumber(activePoint.ma3) : "-"}
            </strong>{" "}
            · 5j{" "}
            <strong className="text-sky-600 dark:text-sky-400">
              {activePoint.ma5 !== null ? formatFrNumber(activePoint.ma5) : "-"}
            </strong>
            {prevDayKcalByDate && prevDayKcalByDate[activePoint.logDate] !== undefined && (
              <>
                {" "}
                · Veille{" "}
                <strong className="text-amber-600 dark:text-amber-300">
                  {prevDayKcalByDate[activePoint.logDate].toLocaleString("fr-FR")} cal
                </strong>
              </>
            )}
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-56 overflow-visible select-none touch-pan-y"
        onMouseMove={handlePointerMove}
        onTouchStart={handlePointerMove}
        onTouchMove={handlePointerMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={padL}
              x2={width - padR}
              y1={yAt(tick)}
              y2={yAt(tick)}
              className="stroke-zinc-200 dark:stroke-white/[0.06]"
              strokeDasharray="3 3"
            />
            <text
              x={padL - 8}
              y={yAt(tick) + 4}
              textAnchor="end"
              className="fill-zinc-500 text-[10px] font-mono"
            >
              {formatFrNumber(tick, 1, 1)}
            </text>
          </g>
        ))}

        {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
        <path d={rawPath} fill="none" stroke="#71717a" strokeWidth="1.2" strokeOpacity="0.4" />
        <path d={ma5Path} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
        <path d={ma3Path} fill="none" stroke="#10b981" strokeWidth="2.75" strokeLinecap="round" />

        {/* Crosshair */}
        {activePoint && (
          <line
            x1={xAt(activeIdx)}
            x2={xAt(activeIdx)}
            y1={padT}
            y2={padT + plotH}
            className="stroke-zinc-300 dark:stroke-white/[0.16]"
            strokeDasharray="2 2"
          />
        )}

        {data.map((d, i) => (
          <g key={d.logDate}>
            <circle
              cx={xAt(i)}
              cy={yAt(d.weightKg)}
              r={activeIdx === i ? 5 : 2.5}
              className={
                activeIdx === i
                  ? "fill-emerald-500 dark:fill-emerald-400 stroke-white dark:stroke-zinc-950"
                  : "fill-zinc-500 dark:fill-zinc-300 stroke-white dark:stroke-zinc-900"
              }
              strokeWidth="1.5"
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
  const [zoomY, setZoomY] = useState<boolean>(true);
  const gradId = useId();

  if (data.length === 0) {
    return (
      <div className="h-44 flex items-center justify-center text-sm text-zinc-500">
        Aucune donnée disponible.
      </div>
    );
  }

  const width = 640;
  const height = 185;
  const padL = 48;
  const padR = 12;
  const padT = 16;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const vals = data.map((d) => d.value);
  const maxData = Math.max(...vals, target ?? 0, 10);
  const minData = Math.min(...vals, target ?? maxData);

  const minVal =
    zoomY && maxData > minData
      ? Math.max(0, Math.floor((minData - (maxData - minData) * 0.2) / 50) * 50)
      : 0;
  const maxVal = Math.ceil(maxData * 1.08);
  const span = Math.max(10, maxVal - minVal);

  const yAt = (v: number) => padT + ((maxVal - Math.max(minVal, v)) / span) * plotH;
  const stepW = plotW / data.length;
  const barW = Math.max(5, Math.min(28, stepW * 0.65));

  const active = hoverIdx !== null ? data[hoverIdx] : data[data.length - 1];
  const isSky = barColorClass.includes("sky");
  const topColor = isSky ? "#38bdf8" : "#10b981";
  const botColor = isSky ? "#0284c7" : "#059669";

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-2">
          <span>{target ? `Objectif : ${target.toLocaleString("fr-FR")} ${unit}` : ""}</span>
          <button
            type="button"
            onClick={() => setZoomY((z) => !z)}
            className={`px-2 py-0.5 rounded-lg border text-[10px] font-medium transition ${
              zoomY
                ? "bg-blue-500/15 border-blue-500/40 text-blue-600 dark:text-blue-300"
                : "bg-zinc-100 dark:bg-white/5 border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400"
            }`}
          >
            {zoomY ? "Zoom actif" : "Vue 0"}
          </button>
        </div>
        {active && (
          <span className="font-mono text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.06] px-2 py-0.5 rounded-lg">
            {active.label} : <strong>{active.value.toLocaleString("fr-FR")}</strong> {unit}
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-44 overflow-visible select-none"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={topColor} stopOpacity="0.95" />
            <stop offset="100%" stopColor={botColor} stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {target !== undefined && target >= minVal && target <= maxVal && (
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
          {minVal.toLocaleString("fr-FR")}
        </text>

        {data.map((d, i) => {
          const x = padL + i * stepW + (stepW - barW) / 2;
          const y = yAt(d.value);
          const h = Math.max(3, padT + plotH - y);
          const showLabel =
            data.length <= 10 || i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 6) === 0;
          return (
            <g key={d.date + i} onMouseEnter={() => setHoverIdx(i)} onTouchStart={() => setHoverIdx(i)}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={5}
                fill={`url(#${gradId})`}
                className={`${hoverIdx === i ? "opacity-100" : "opacity-85"} transition-opacity`}
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
