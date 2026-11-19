"use client";

import React, { useState } from "react";
import {
  aggregateSeriesByRange,
  analyzeWeightTrends,
  computeWeightSeriesWithTrends,
  formatFrNumber,
  parseStepsImportText,
  prevDateISO,
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
import { CalendarIcon, ChartIcon, PlusIcon, ShareIcon, TrashIcon, XIcon } from "./Icons";
import { useModalEffects } from "@/lib/useModalEffects";

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
  baisse: { label: "Baisse", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  maintenance: { label: "Maintenance", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30" },
  hausse: { label: "Hausse", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
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

function formatFullFrenchDate(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

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

  // Weight modal state
  const [weightModalOpen, setWeightModalOpen] = useState(false);
  const [weightDate, setWeightDate] = useState<string>(selectedDate);
  const [weightInput, setWeightInput] = useState<string>(
    weights.length > 0 ? String(weights[weights.length - 1].weightKg) : "70.0"
  );

  // Steps modal & import state
  const [stepsModalOpen, setStepsModalOpen] = useState(false);
  const [stepsDate, setStepsDate] = useState<string>(selectedDate);
  const [stepsInput, setStepsInput] = useState<string>("8500");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);

  useModalEffects(weightModalOpen, () => setWeightModalOpen(false));
  useModalEffects(stepsModalOpen, () => setStepsModalOpen(false));

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
  const kcalEntriesAll = Array.from(kcalByDate.entries())
    .map(([date, kcal]) => ({ date, kcal }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const kcalSeries = aggregateSeriesByRange(
    kcalEntriesAll.map((e) => ({ date: e.date, value: e.kcal })),
    range
  );

  // Associer chaque pesée (matin à jeun) aux calories consommées la veille
  const prevDayKcalByWeightDate: Record<string, number> = {};
  for (const w of weights) {
    const prevKcal = kcalByDate.get(prevDateISO(w.logDate));
    if (prevKcal !== undefined) {
      prevDayKcalByWeightDate[w.logDate] = prevKcal;
    }
  }
  const avgKcal =
    kcalSeries.length > 0
      ? Math.round(kcalSeries.reduce((s, d) => s + d.value, 0) / kcalSeries.length)
      : null;
  const selectedDayKcal = kcalByDate.get(selectedDate) ?? 0;

  // Pas
  const sortedStepsDesc = [...steps].sort((a, b) =>
    b.logDate.localeCompare(a.logDate)
  );
  const stepSeries = aggregateSeriesByRange(
    steps.map((s) => ({ date: s.logDate, value: s.steps })),
    range
  );
  const avgSteps =
    stepSeries.length > 0
      ? Math.round(stepSeries.reduce((s, d) => s + d.value, 0) / stepSeries.length)
      : null;
  const selectedDaySteps = steps.find((s) => s.logDate === selectedDate)?.steps ?? 0;

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
      onLogSteps(stepsDate || selectedDate, Math.round(val));
      setStepsModalOpen(false);
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

  function exportActiveCSV() {
    let filename = "macropulse-poids.csv";
    let csv = "";
    if (metric === "weight") {
      const rows = [...weights]
        .sort((a, b) => a.logDate.localeCompare(b.logDate))
        .map((w) => {
          const prevKcal = prevDayKcalByWeightDate[w.logDate];
          return `${w.logDate},${w.weightKg},${prevKcal ?? ""}`;
        });
      csv = ["date,poids_kg,kcal_veille", ...rows].join("\n");
    } else if (metric === "kcal") {
      filename = "macropulse-calories.csv";
      const rows = [...kcalEntriesAll]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((k) => `${k.date},${k.kcal}`);
      csv = ["date,kcal", ...rows].join("\n");
    } else {
      filename = "macropulse-pas.csv";
      const rows = [...steps]
        .sort((a, b) => a.logDate.localeCompare(b.logDate))
        .map((s) => `${s.logDate},${s.steps}`);
      csv = ["date,pas", ...rows].join("\n");
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleTopPlusClick() {
    if (metric === "steps") {
      setStepsDate(selectedDate);
      setStepsInput(String(selectedDaySteps || 8500));
      setStepsModalOpen(true);
    } else {
      setWeightDate(selectedDate);
      if (currentWeight !== null) setWeightInput(String(currentWeight));
      setWeightModalOpen(true);
    }
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
          className="w-11 h-11 rounded-full bg-white dark:bg-[#1a2030] border border-zinc-200 dark:border-white/10 flex items-center justify-center text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-[#232a3e] transition active:scale-95"
          aria-label="Retour"
        >
          ←
        </button>

        <h2 className="text-base font-semibold tracking-tight">Mesures</h2>

        <div className="inline-flex items-center rounded-full bg-white dark:bg-[#1a2030] border border-zinc-200 dark:border-white/10 p-0.5 gap-0.5">
          <button
            type="button"
            onClick={exportActiveCSV}
            className="w-11 h-11 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300"
            title="Exporter en CSV"
            aria-label="Exporter en CSV"
          >
            <ShareIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleTopPlusClick}
            className="w-11 h-11 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 flex items-center justify-center text-zinc-800 dark:text-zinc-100"
            title={metric === "steps" ? "Ajouter des pas" : "Ajouter une pesée"}
            aria-label={metric === "steps" ? "Ajouter des pas" : "Ajouter une pesée"}
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2-Column Filter Bar (Poids / Calories / Pas | 1 semaine / 1 mois / 1 an) */}
      <div className="grid grid-cols-2 border-y border-zinc-200 dark:border-white/[0.06] py-1 text-sm">
        <button
          type="button"
          onClick={cycleMetric}
          aria-label={`Métrique : ${METRIC_LABELS[metric]}`}
          className="min-h-11 flex items-center justify-between px-2 pr-4 border-r border-zinc-200 dark:border-white/[0.06] hover:opacity-85 transition"
        >
          <ChartIcon className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          <span className="font-medium text-blue-600 dark:text-blue-400">{METRIC_LABELS[metric]}</span>
        </button>

        <button
          type="button"
          onClick={cycleRange}
          aria-label={`Période : ${RANGE_LABELS[range]}`}
          className="min-h-11 flex items-center justify-between px-2 pl-4 hover:opacity-85 transition"
        >
          <CalendarIcon className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          <span className="font-medium text-blue-600 dark:text-blue-400">{RANGE_LABELS[range]}</span>
        </button>
      </div>

      {/* VUE POIDS */}
      {metric === "weight" && (
        <>
          <div className="grid grid-cols-3 gap-2 pt-1 pb-2">
            <div>
              <p className="text-lg font-bold font-mono">
                {startWeight !== null ? `${formatFrNumber(startWeight)} kg` : "—"}
              </p>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider">DÉBUT</p>
            </div>

            <div>
              <p className="text-lg font-bold font-mono">
                {currentWeight !== null ? `${formatFrNumber(currentWeight)} kg` : "—"}
              </p>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider">ACTUEL</p>
            </div>

            <div>
              <p className="text-lg font-bold font-mono inline-flex items-center gap-1">
                {weightDelta !== null ? (
                  <>
                    <span className={weightDelta <= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                      {weightDelta <= 0 ? "↘" : "↗"}
                    </span>
                    <span>{formatFrNumber(Math.abs(weightDelta))} kg</span>
                  </>
                ) : (
                  "—"
                )}
              </p>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider">
                VARIATION{" "}
                {weightPct !== null
                  ? `(${weightPct > 0 ? "+" : ""}${formatFrNumber(weightPct)} %)`
                  : ""}
              </p>
            </div>
          </div>

          <section className="rounded-2xl bg-white dark:bg-gradient-to-b dark:from-[#1a2030] dark:to-[#141824] border border-zinc-200 dark:border-white/[0.07] shadow-sm dark:shadow-none p-4 space-y-4">
            <WeightTrendChart
              data={visibleWeightSeries}
              prevDayKcalByDate={prevDayKcalByWeightDate}
            />

            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-zinc-200 dark:border-white/[0.06]">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="text-zinc-500 dark:text-zinc-400">Tendance 3j : </span>
                  <strong className="font-mono">
                    {trendAnalysis.ma3Latest !== null ? `${formatFrNumber(trendAnalysis.ma3Latest)} kg` : "—"}
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
                  <span className="text-zinc-500 dark:text-zinc-400">Tendance 5j : </span>
                  <strong className="font-mono">
                    {trendAnalysis.ma5Latest !== null ? `${formatFrNumber(trendAnalysis.ma5Latest)} kg` : "—"}
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

          <section className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">Entrées</h3>
              <button
                type="button"
                onClick={() => {
                  setWeightDate(selectedDate);
                  setWeightModalOpen(true);
                }}
                className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline"
              >
                + Ajouter une pesée
              </button>
            </div>

            {sortedWeightsDesc.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">
                Aucune pesée enregistrée. Clique sur + en haut à droite pour commencer.
              </p>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-white/[0.06]">
                {sortedWeightsDesc.map((entry) => {
                  const prevKcal = prevDayKcalByWeightDate[entry.logDate];
                  return (
                  <div
                    key={entry.logDate}
                    onClick={() => {
                      setWeightDate(entry.logDate);
                      setWeightInput(String(entry.weightKg));
                      setWeightModalOpen(true);
                    }}
                    className="cursor-pointer py-3 flex items-center justify-between gap-3 hover:bg-zinc-200/50 dark:hover:bg-white/[0.02] px-1 rounded-xl transition"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100">
                          {entry.weightKg.toString().replace(".", ",")} kg
                        </p>
                        {prevKcal !== undefined && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-[11px] font-mono text-amber-700 dark:text-amber-300">
                            Veille : {prevKcal.toLocaleString("fr-FR")} cal
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 capitalize">
                        {formatFullFrenchDate(entry.logDate)}
                      </p>
                    </div>
                    {onDeleteWeight && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteWeight(entry.logDate);
                        }}
                        className="p-2 text-zinc-400 dark:text-zinc-500 hover:text-rose-500 dark:hover:text-rose-400"
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

      {/* VUE CALORIES (même style Mesures) */}
      {metric === "kcal" && (
        <>
          <div className="grid grid-cols-3 gap-2 pt-1 pb-2">
            <div>
              <p className="text-lg font-bold font-mono">
                {avgKcal !== null ? `${avgKcal.toLocaleString("fr-FR")} cal` : "—"}
              </p>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider">MOYENNE</p>
            </div>

            <div>
              <p className="text-lg font-bold font-mono">
                {selectedDayKcal.toLocaleString("fr-FR")} cal
              </p>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider">SÉLECTION</p>
            </div>

            <div>
              <p className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {goals.targetKcal.toLocaleString("fr-FR")} cal
              </p>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider">OBJECTIF</p>
            </div>
          </div>

          <section className="rounded-2xl bg-white dark:bg-gradient-to-b dark:from-[#1a2030] dark:to-[#141824] border border-zinc-200 dark:border-white/[0.07] shadow-sm dark:shadow-none p-4 space-y-3">
            <BarHistoryChart
              data={kcalSeries}
              target={goals.targetKcal}
              unit="kcal"
              barColorClass="fill-emerald-500"
            />
          </section>

          <section className="space-y-2 pt-2">
            <h3 className="text-base font-bold">Entrées</h3>
            {kcalEntriesAll.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">
                Aucune calorie enregistrée pour le moment.
              </p>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-white/[0.06]">
                {kcalEntriesAll.slice(0, 30).map((entry) => {
                  const delta = entry.kcal - goals.targetKcal;
                  return (
                    <div
                      key={entry.date}
                      className="py-3 flex items-center justify-between gap-3 px-1"
                    >
                      <div>
                        <p className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100">
                          {entry.kcal.toLocaleString("fr-FR")} cal
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 capitalize">
                          {formatFullFrenchDate(entry.date)}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-mono font-medium ${
                          delta <= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {delta > 0 ? `+${delta}` : delta} cal
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {/* VUE PAS (même style Mesures) */}
      {metric === "steps" && (
        <>
          <div className="grid grid-cols-3 gap-2 pt-1 pb-2">
            <div>
              <p className="text-lg font-bold font-mono">
                {avgSteps !== null ? avgSteps.toLocaleString("fr-FR") : "—"}
              </p>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider">MOYENNE</p>
            </div>

            <div>
              <p className="text-lg font-bold font-mono">
                {selectedDaySteps.toLocaleString("fr-FR")}
              </p>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider">SÉLECTION</p>
            </div>

            <div>
              <p className="text-lg font-bold font-mono text-sky-600 dark:text-sky-400">
                {goals.targetSteps.toLocaleString("fr-FR")}
              </p>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider">OBJECTIF</p>
            </div>
          </div>

          <section className="rounded-2xl bg-white dark:bg-gradient-to-b dark:from-[#1a2030] dark:to-[#141824] border border-zinc-200 dark:border-white/[0.07] shadow-sm dark:shadow-none p-4 space-y-3">
            <BarHistoryChart
              data={stepSeries}
              target={goals.targetSteps}
              unit="pas"
              barColorClass="fill-sky-500"
            />
          </section>

          <section className="space-y-2 pt-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold">Entrées</h3>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setImportOpen((v) => !v)}
                  className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                >
                  Import CSV/JSON
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStepsDate(selectedDate);
                    setStepsInput(String(selectedDaySteps || 8500));
                    setStepsModalOpen(true);
                  }}
                  className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline"
                >
                  + Ajouter des pas
                </button>
              </div>
            </div>

            {importOpen && (
              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#181d2a] border border-zinc-200 dark:border-white/10 space-y-2.5">
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Colle un export CSV (<code>2026-11-15,9800</code>) ou JSON (Apple Santé / Google Takeout) :
                </p>
                <textarea
                  rows={3}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={"2026-11-14,10450\n2026-11-15,9820"}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-[#0f131d] border border-zinc-300 dark:border-white/10 p-2.5 text-xs font-mono text-zinc-900 dark:text-zinc-100"
                />
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleRunImport}
                    className="px-3.5 py-1.5 rounded-xl bg-sky-500 text-white dark:text-zinc-950 text-xs font-semibold"
                  >
                    Importer les pas
                  </button>
                  {importStatus && <span className="text-xs text-emerald-600 dark:text-emerald-400">{importStatus}</span>}
                </div>
              </div>
            )}

            {sortedStepsDesc.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">
                Aucun pas enregistré. Clique sur + en haut à droite pour ajouter une journée.
              </p>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-white/[0.06]">
                {sortedStepsDesc.map((entry) => (
                  <div
                    key={entry.logDate}
                    onClick={() => {
                      setStepsDate(entry.logDate);
                      setStepsInput(String(entry.steps));
                      setStepsModalOpen(true);
                    }}
                    className="cursor-pointer py-3 flex items-center justify-between gap-3 hover:bg-zinc-200/50 dark:hover:bg-white/[0.02] px-1 rounded-xl transition"
                  >
                    <div>
                      <p className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100">
                        {entry.steps.toLocaleString("fr-FR")} pas
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 capitalize">
                        {formatFullFrenchDate(entry.logDate)}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-mono ${
                        entry.steps >= goals.targetSteps ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500"
                      }`}
                    >
                      {Math.round((entry.steps / Math.max(1, goals.targetSteps)) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Modal Ajout / Modification de pesée */}
      {weightModalOpen && (
        <div
          onClick={() => setWeightModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <form
            onSubmit={handleSaveWeight}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#181d2a] border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-zinc-100 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Enregistrer une pesée</h3>
              <button
                type="button"
                onClick={() => setWeightModalOpen(false)}
                className="p-1.5 rounded-full bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="space-y-1">
                <span className="text-zinc-500 dark:text-zinc-400">Date</span>
                <input
                  type="date"
                  value={weightDate}
                  onChange={(e) => setWeightDate(e.target.value)}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-[#0f131d] border border-zinc-300 dark:border-white/10 px-3 py-2 font-mono text-zinc-900 dark:text-zinc-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-zinc-500 dark:text-zinc-400">Poids (kg)</span>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-[#0f131d] border border-zinc-300 dark:border-white/10 px-3 py-2 font-mono text-emerald-600 dark:text-emerald-400 font-bold"
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

      {/* Modal Ajout / Modification de pas */}
      {stepsModalOpen && (
        <div
          onClick={() => setStepsModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <form
            onSubmit={handleSaveSteps}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#181d2a] border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-zinc-100 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Enregistrer des pas</h3>
              <button
                type="button"
                onClick={() => setStepsModalOpen(false)}
                className="p-1.5 rounded-full bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="space-y-1">
                <span className="text-zinc-500 dark:text-zinc-400">Date</span>
                <input
                  type="date"
                  value={stepsDate}
                  onChange={(e) => setStepsDate(e.target.value)}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-[#0f131d] border border-zinc-300 dark:border-white/10 px-3 py-2 font-mono text-zinc-900 dark:text-zinc-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-zinc-500 dark:text-zinc-400">Nombre de pas</span>
                <input
                  type="number"
                  min={0}
                  required
                  value={stepsInput}
                  onChange={(e) => setStepsInput(e.target.value)}
                  className="w-full rounded-xl bg-zinc-50 dark:bg-[#0f131d] border border-zinc-300 dark:border-white/10 px-3 py-2 font-mono text-sky-600 dark:text-sky-400 font-bold"
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
