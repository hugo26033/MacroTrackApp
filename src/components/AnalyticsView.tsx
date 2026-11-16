"use client";

import React, { useState } from "react";
import {
  aggregateSeriesByRange,
  analyzeWeightTrends,
  computeWeightSeriesWithTrends,
  parseStepsImportText,
} from "@/lib/calculations";
import type { ChartRange, FoodLogEntry, NutritionGoals, StepEntry, TrendDirection, WeightEntry } from "@/lib/types";
import { BarHistoryChart, WeightTrendChart } from "./Charts";
import { FootprintsIcon, ScaleIcon } from "./Icons";

interface AnalyticsViewProps {
  weights: WeightEntry[];
  steps: StepEntry[];
  foodLogs: FoodLogEntry[];
  goals: NutritionGoals;
  trendThresholdKgWeek: number;
  selectedDate: string;
  onLogWeight: (date: string, weightKg: number) => void;
  onLogSteps: (date: string, steps: number) => void;
  onImportSteps: (entries: StepEntry[]) => void;
}

const TREND_BADGE: Record<TrendDirection, { label: string; cls: string }> = {
  baisse: { label: "Baisse", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  maintenance: { label: "Maintenance", cls: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  hausse: { label: "Hausse", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

export function AnalyticsView({
  weights,
  steps,
  foodLogs,
  goals,
  trendThresholdKgWeek,
  selectedDate,
  onLogWeight,
  onLogSteps,
  onImportSteps,
}: AnalyticsViewProps) {
  const [range, setRange] = useState<ChartRange>("month");
  const [weightInput, setWeightInput] = useState<string>(
    weights.length > 0 ? String(weights[weights.length - 1].weightKg) : "76.5"
  );
  const [stepsInput, setStepsInput] = useState<string>("8500");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const daysLimit = range === "week" ? 7 : range === "month" ? 30 : 365;
  const fullWeightSeries = computeWeightSeriesWithTrends(weights);
  const visibleWeightSeries = fullWeightSeries.slice(-daysLimit);
  const trendAnalysis = analyzeWeightTrends(weights, trendThresholdKgWeek);

  // Agréger les kcal par jour
  const kcalByDate = new Map<string, number>();
  for (const log of foodLogs) {
    kcalByDate.set(log.logDate, (kcalByDate.get(log.logDate) ?? 0) + log.nutrients.kcal);
  }
  const kcalSeries = aggregateSeriesByRange(
    Array.from(kcalByDate.entries()).map(([date, value]) => ({ date, value })),
    range
  );

  const stepSeries = aggregateSeriesByRange(
    steps.map((s) => ({ date: s.logDate, value: s.steps })),
    range
  );

  function handleSaveWeight(e: React.FormEvent) {
    e.preventDefault();
    const val = Number(weightInput.replace(",", "."));
    if (Number.isFinite(val) && val > 20 && val < 350) {
      onLogWeight(selectedDate, Math.round(val * 100) / 100);
    }
  }

  function handleSaveSteps(e: React.FormEvent) {
    e.preventDefault();
    const val = Number(stepsInput);
    if (Number.isFinite(val) && val >= 0) {
      onLogSteps(selectedDate, Math.round(val));
    }
  }

  function handleRunImport() {
    const { entries } = parseStepsImportText(importText);
    if (entries.length === 0) {
      setImportStatus("Aucune ligne valide détectée (format attendu : YYYY-MM-DD,pas ou JSON).");
      return;
    }
    onImportSteps(entries);
    setImportStatus(`${entries.length} jour(s) de pas importés avec succès.`);
    setImportText("");
  }

  return (
    <div className="space-y-5">
      {/* Sélecteur Semaine / Mois / Année */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Courbes & Tendances</h2>
        <div className="inline-flex rounded-xl bg-zinc-900 border border-zinc-800 p-1 text-xs">
          {(
            [
              { id: "week", label: "Semaine" },
              { id: "month", label: "Mois" },
              { id: "year", label: "Année" },
            ] as const
          ).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                range === r.id ? "bg-emerald-500 text-zinc-950" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Carte Poids + Tendances 3j / 5j */}
      <section className="rounded-3xl bg-zinc-900/80 border border-zinc-800 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ScaleIcon className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-sm sm:text-base">Poids & Tendances 3j / 5j</h3>
          </div>

          <form onSubmit={handleSaveWeight} className="flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              className="w-24 rounded-xl bg-zinc-950 border border-zinc-800 px-2.5 py-1.5 text-sm font-mono"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold"
            >
              Peser ({selectedDate.slice(5)})
            </button>
          </form>
        </div>

        {/* Cartes de tendance 3j & 5j */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-400">Tendance 3 jours</p>
              <p className="text-base font-semibold font-mono mt-0.5">
                {trendAnalysis.ma3Latest !== null ? `${trendAnalysis.ma3Latest} kg` : "—"}
              </p>
              <p className="text-[11px] text-zinc-500">
                Pente :{" "}
                {trendAnalysis.slope3KgPerWeek !== null
                  ? `${trendAnalysis.slope3KgPerWeek > 0 ? "+" : ""}${trendAnalysis.slope3KgPerWeek} kg/sem`
                  : "—"}
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full border text-xs font-semibold ${
                TREND_BADGE[trendAnalysis.status3].cls
              }`}
            >
              {TREND_BADGE[trendAnalysis.status3].label}
            </span>
          </div>

          <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-400">Tendance 5 jours</p>
              <p className="text-base font-semibold font-mono mt-0.5">
                {trendAnalysis.ma5Latest !== null ? `${trendAnalysis.ma5Latest} kg` : "—"}
              </p>
              <p className="text-[11px] text-zinc-500">
                Pente :{" "}
                {trendAnalysis.slope5KgPerWeek !== null
                  ? `${trendAnalysis.slope5KgPerWeek > 0 ? "+" : ""}${trendAnalysis.slope5KgPerWeek} kg/sem`
                  : "—"}
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full border text-xs font-semibold ${
                TREND_BADGE[trendAnalysis.status5].cls
              }`}
            >
              {TREND_BADGE[trendAnalysis.status5].label}
            </span>
          </div>
        </div>

        <WeightTrendChart data={visibleWeightSeries} />
      </section>

      {/* Évolution Kcal */}
      <section className="rounded-3xl bg-zinc-900/80 border border-zinc-800 p-4 sm:p-5 space-y-3">
        <h3 className="font-semibold text-sm sm:text-base">Évolution des calories</h3>
        <BarHistoryChart
          data={kcalSeries}
          target={goals.targetKcal}
          unit="kcal"
          barColorClass="fill-emerald-500"
        />
      </section>

      {/* Évolution Pas + Saisie & Import CSV/JSON */}
      <section className="rounded-3xl bg-zinc-900/80 border border-zinc-800 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FootprintsIcon className="w-5 h-5 text-sky-400" />
            <h3 className="font-semibold text-sm sm:text-base">Évolution des pas</h3>
          </div>
          <div className="flex items-center gap-2">
            <form onSubmit={handleSaveSteps} className="flex items-center gap-1.5">
              <input
                type="number"
                value={stepsInput}
                onChange={(e) => setStepsInput(e.target.value)}
                className="w-24 rounded-xl bg-zinc-950 border border-zinc-800 px-2.5 py-1.5 text-sm font-mono"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-zinc-950 text-xs font-semibold"
              >
                Enregistrer
              </button>
            </form>
            <button
              type="button"
              onClick={() => setImportOpen((v) => !v)}
              className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium"
            >
              Import CSV/JSON
            </button>
          </div>
        </div>

        {importOpen && (
          <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2.5">
            <p className="text-xs text-zinc-400">
              Colle un export CSV (<code>2026-11-15,9800</code>) ou JSON (Apple Santé / Google Takeout) :
            </p>
            <textarea
              rows={3}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={"2026-11-14,10450\n2026-11-15,9820"}
              className="w-full rounded-xl bg-zinc-900 border border-zinc-800 p-2.5 text-xs font-mono"
            />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleRunImport}
                className="px-3.5 py-1.5 rounded-xl bg-sky-500 text-zinc-950 text-xs font-semibold"
              >
                Importer les pas
              </button>
              {importStatus && <span className="text-xs text-emerald-400">{importStatus}</span>}
            </div>
          </div>
        )}

        <BarHistoryChart
          data={stepSeries}
          target={goals.targetSteps}
          unit="pas"
          barColorClass="fill-sky-500"
        />
      </section>
    </div>
  );
}
