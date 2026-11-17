"use client";

import React, { useState } from "react";
import {
  aggregateSeriesByRange,
  analyzeWeightTrends,
  computeWeightSeriesWithTrends,
  parseStepsImportText,
} from "@/lib/calculations";
import type {
  ChartRange,
  FoodLogEntry,
  NutritionGoals,
  StepEntry,
  TrendDirection,
  WeightEntry,
} from "@/lib/types";
import { BarHistoryChart, WeightTrendChart } from "./Charts";
import { ChartIcon, FootprintsIcon, PlusIcon, TrashIcon, XIcon } from "./Icons";

interface AnalyticsViewProps {
  weights: WeightEntry[];
  steps: StepEntry[];
  foodLogs: FoodLogEntry[];
  goals: NutritionGoals;
  trendThresholdKgWeek: number;
  selectedDate: string;
  onLogWeight: (date: string, weightKg: number) => void;
  onDeleteWeight?: (date: string) => void;
  onLogSteps: (date: string, steps: number) => void;
  onImportSteps: (entries: StepEntry[]) => void;
  onBack?: () => void;
}

type MetricView = "weight" | "kcal" | "steps";

const TREND_BADGE: Record<TrendDirection, { label: string; cls: string }> = {
  baisse: { label: "Baisse", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  maintenance: { label: "Maintenance", cls: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  hausse: { label: "Hausse", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

const RANGE_LABELS: Record<ChartRange, string> = {
  week: "1 semaine",
  month: "1 mois",
  year: "1 an",
};

const METRIC_LABELS: Record<MetricView, string> = {
  weight: "Poids",
  kcal: "Calories",
  steps: "Pas",
};

export function AnalyticsView({
  weights,
  steps,
  foodLogs,
  goals,
  trendThresholdKgWeek,
  selectedDate,
  onLogWeight,
  onDeleteWeight,
  onLogSteps,
  onImportSteps,
  onBack,
}: AnalyticsViewProps) {
  const [metric, setMetric] = useState<MetricView>("weight");
  const [range, setRange] = useState<ChartRange>("week");
  const [weightModalOpen, setWeightModalOpen] = useState(false);
  const [weightDate, setWeightDate] = useState<string>(selectedDate);
  const [weightInput, setWeightInput] = useState<string>(
    weights.length > 0 ? String(weights[weights.length - 1].weightKg) : "70.0"
  );
  const [stepsInput, setStepsInput] = useState<string>("8500");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const daysLimit = range === "week" ? 7 : range === "month" ? 30 : 365;
  const fullWeightSeries = computeWeightSeriesWithTrends(weights);
  const visibleWeightSeries = fullWeightSeries.slice(-daysLimit);
  const trendAnalysis = analyzeWeightTrends(weights, trendThresholdKgWeek);

  const startWeight =
    visibleWeightSeries.length > 0 ? visibleWeightSeries[0].weightKg : null;
  const currentWeight =
    visibleWeightSeries.length > 0
      ? visibleWeightSeries[visibleWeightSeries.length - 1].weightKg
      : null;
  const weightDelta =
    startWeight !== null && currentWeight !== null
      ? Math.round((currentWeight - startWeight) * 10) / 10
      : null;
  const weightPct =
    startWeight && weightDelta !== null
      ? Math.round((weightDelta / startWeight) * 1000) / 10
      : null;

  const sortedWeightsDesc = [...weights].sort((a, b) =>
    b.logDate.localeCompare(a.logDate)
  );

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
      onLogWeight(weightDate || selectedDate, Math.round(val * 100) / 100);
      setWeightModalOpen(false);
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

  function exportWeightsCSV() {
    const header = "date,poids_kg";
    const rows = [...weights]
      .sort((a, b) => a.logDate.localeCompare(b.logDate))
      .map((w) => `${w.logDate},${w.weightKg}`);
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "macropulse-poids.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function cycleMetric() {
    setMetric((m) => (m === "weight" ? "kcal" : m === "kcal" ? "steps" : "weight"));
  }

  function cycleRange() {
    setRange((r) => (r === "week" ? "month" : r === "month" ? "year" : "week"));
  }

  return (
    <div className="space-y-4">
      {/* Top Bar style Measurements */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#1a2030] border border-white/10 flex items-center justify-center text-zinc-200 hover:bg-[#232a3e] transition active:scale-95"
          aria-label="Retour"
        >
          ←
        </button>

        <h2 className="text-base font-semibold tracking-tight">Mesures</h2>

        <div className="inline-flex items-center rounded-full bg-[#1a2030] border border-white/10 p-1 gap-1">
          <button
            type="button"
            onClick={exportWeightsCSV}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-zinc-300 text-xs"
            title="Exporter les pesées (CSV)"
          >
            📤
          </button>
          <button
            type="button"
            onClick={() => {
              setWeightDate(selectedDate);
              if (currentWeight !== null) setWeightInput(String(currentWeight));
              setWeightModalOpen(true);
            }}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-zinc-100"
            title="Ajouter une pesée"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2-Column Filter Bar (Poids | 1 semaine) */}
      <div className="grid grid-cols-2 border-y border-white/[0.06] py-2.5 text-sm">
        <button
          type="button"
          onClick={cycleMetric}
          className="flex items-center justify-between px-2 pr-4 border-r border-white/[0.06] hover:opacity-85 transition"
        >
          <ChartIcon className="w-4 h-4 text-zinc-400" />
          <span className="font-medium text-blue-400">{METRIC_LABELS[metric]}</span>
        </button>

        <button
          type="button"
          onClick={cycleRange}
          className="flex items-center justify-between px-2 pl-4 hover:opacity-85 transition"
        >
          <span className="text-zinc-400 text-xs">📅</span>
          <span className="font-medium text-blue-400">{RANGE_LABELS[range]}</span>
        </button>
      </div>

      {/* VUE POIDS (style Measurements) */}
      {metric === "weight" && (
        <>
          {/* Résumé 3 colonnes : DÉBUT | ACTUEL | MODIFIER */}
          <div className="grid grid-cols-3 gap-2 pt-1 pb-2">
            <div>
              <p className="text-lg font-bold font-mono">
                {startWeight !== null ? `${startWeight.toString().replace(".", ",")} kg` : "—"}
              </p>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider">DÉBUT</p>
            </div>

            <div>
              <p className="text-lg font-bold font-mono">
                {currentWeight !== null ? `${currentWeight.toString().replace(".", ",")} kg` : "—"}
              </p>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider">ACTUEL</p>
            </div>

            <div>
              <p className="text-lg font-bold font-mono inline-flex items-center gap-1">
                {weightDelta !== null ? (
                  <>
                    <span className={weightDelta <= 0 ? "text-emerald-400" : "text-amber-400"}>
                      {weightDelta <= 0 ? "↘" : "↗"}
                    </span>
                    <span>{Math.abs(weightDelta).toString().replace(".", ",")} kg</span>
                  </>
                ) : (
                  "—"
                )}
              </p>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider">
                MODIFIER{" "}
                {weightPct !== null ? `(${weightPct > 0 ? "+" : ""}${weightPct}%)` : ""}
              </p>
            </div>
          </div>

          {/* Courbe zoomée */}
          <section className="rounded-2xl bg-gradient-to-b from-[#1a2030] to-[#141824] border border-white/[0.07] p-4 space-y-4">
            <WeightTrendChart data={visibleWeightSeries} />

            {/* Badges Tendances 3j / 5j compacts */}
            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-white/[0.06]">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="text-zinc-400">Tendance 3j : </span>
                  <strong className="font-mono">
                    {trendAnalysis.ma3Latest !== null ? `${trendAnalysis.ma3Latest} kg` : "—"}
                  </strong>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                    TREND_BADGE[trendAnalysis.status3].cls
                  }`}
                >
                  {TREND_BADGE[trendAnalysis.status3].label}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="text-zinc-400">Tendance 5j : </span>
                  <strong className="font-mono">
                    {trendAnalysis.ma5Latest !== null ? `${trendAnalysis.ma5Latest} kg` : "—"}
                  </strong>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                    TREND_BADGE[trendAnalysis.status5].cls
                  }`}
                >
                  {TREND_BADGE[trendAnalysis.status5].label}
                </span>
              </div>
            </div>
          </section>

          {/* Liste des Entrées */}
          <section className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">Entrées</h3>
              <button
                type="button"
                onClick={() => {
                  setWeightDate(selectedDate);
                  setWeightModalOpen(true);
                }}
                className="text-xs text-blue-400 font-medium hover:underline"
              >
                + Ajouter une pesée
              </button>
            </div>

            {sortedWeightsDesc.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">
                Aucune pesée enregistrée. Clique sur + en haut à droite pour commencer.
              </p>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {sortedWeightsDesc.map((entry) => {
                  const formattedDate = new Date(`${entry.logDate}T12:00:00`).toLocaleDateString(
                    "fr-FR",
                    {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    }
                  );
                  return (
                    <div
                      key={entry.logDate}
                      onClick={() => {
                        setWeightDate(entry.logDate);
                        setWeightInput(String(entry.weightKg));
                        setWeightModalOpen(true);
                      }}
                      className="cursor-pointer py-3 flex items-center justify-between gap-3 hover:bg-white/[0.02] px-1 rounded-xl transition"
                    >
                      <div>
                        <p className="text-sm font-bold font-mono text-zinc-100">
                          {entry.weightKg.toString().replace(".", ",")} kg
                        </p>
                        <p className="text-xs text-zinc-400 capitalize">{formattedDate}</p>
                      </div>
                      {onDeleteWeight && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteWeight(entry.logDate);
                          }}
                          className="p-2 text-zinc-500 hover:text-rose-400"
                          title="Supprimer cette pesée"
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {/* VUE CALORIES */}
      {metric === "kcal" && (
        <section className="rounded-3xl bg-gradient-to-b from-[#1a2030] to-[#141824] border border-white/[0.07] p-4 sm:p-5 space-y-3">
          <h3 className="font-semibold text-sm sm:text-base">Évolution des calories</h3>
          <BarHistoryChart
            data={kcalSeries}
            target={goals.targetKcal}
            unit="kcal"
            barColorClass="fill-emerald-500"
          />
        </section>
      )}

      {/* VUE PAS */}
      {metric === "steps" && (
        <section className="rounded-3xl bg-gradient-to-b from-[#1a2030] to-[#141824] border border-white/[0.07] p-4 sm:p-5 space-y-4">
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
                  className="w-24 rounded-xl bg-[#0f131d] border border-white/10 px-2.5 py-1.5 text-sm font-mono"
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
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium"
              >
                Import CSV/JSON
              </button>
            </div>
          </div>

          {importOpen && (
            <div className="p-3.5 rounded-2xl bg-[#0f131d] border border-white/10 space-y-2.5">
              <p className="text-xs text-zinc-400">
                Colle un export CSV (<code>2026-11-15,9800</code>) ou JSON (Apple Santé / Google Takeout) :
              </p>
              <textarea
                rows={3}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={"2026-11-14,10450\n2026-11-15,9820"}
                className="w-full rounded-xl bg-[#181d2a] border border-white/10 p-2.5 text-xs font-mono"
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
      )}

      {/* Modal Ajout / Modification de pesée */}
      {weightModalOpen && (
        <div
          onClick={() => setWeightModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <form
            onSubmit={handleSaveWeight}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-[#181d2a] border border-white/10 p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Enregistrer une pesée</h3>
              <button
                type="button"
                onClick={() => setWeightModalOpen(false)}
                className="p-1.5 rounded-full bg-white/5 text-zinc-400 hover:text-zinc-200"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="space-y-1">
                <span className="text-zinc-400">Date</span>
                <input
                  type="date"
                  value={weightDate}
                  onChange={(e) => setWeightDate(e.target.value)}
                  className="w-full rounded-xl bg-[#0f131d] border border-white/10 px-3 py-2 font-mono text-zinc-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-zinc-400">Poids (kg)</span>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  className="w-full rounded-xl bg-[#0f131d] border border-white/10 px-3 py-2 font-mono text-emerald-400 font-bold"
                />
              </label>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-gradient-to-b from-blue-400 to-blue-600 text-white font-semibold text-sm shadow-lg"
            >
              Enregistrer
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
