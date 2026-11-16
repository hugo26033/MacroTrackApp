"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  analyzeWeightTrends,
  computeAutomaticFasting,
  sumNutrients,
  todayISO,
} from "@/lib/calculations";
import {
  AppState,
  EMPTY_APP_STATE,
  createInitialDemoState,
  exportAppStateAsJSON,
  exportFoodLogsAsCSV,
  loadAppState,
  saveAppState,
} from "@/lib/storage";
import {
  FoodItem,
  FoodLogEntry,
  MICRONUTRIENT_CATALOG,
  MealSlot,
  StepEntry,
} from "@/lib/types";
import { AnalyticsView } from "./AnalyticsView";
import { FastingView } from "./FastingView";
import { GoalsTdeeView } from "./GoalsTdeeView";
import {
  ChartIcon,
  ClockIcon,
  CopyIcon,
  DropletIcon,
  FootprintsIcon,
  HomeIcon,
  MoonIcon,
  PlusIcon,
  ScaleIcon,
  SettingsIcon,
  SunIcon,
  TrashIcon,
} from "./Icons";
import { QuickAddModal } from "./QuickAddModal";

type ActiveTab = "today" | "analytics" | "fasting" | "goals";

const MEAL_LABELS: { slot: MealSlot; label: string }[] = [
  { slot: "breakfast", label: "Petit-déjeuner" },
  { slot: "lunch", label: "Déjeuner" },
  { slot: "dinner", label: "Dîner" },
  { slot: "snack", label: "Collation" },
];

export function MacroPulseApp() {
  const [state, setState] = useState<AppState>(EMPTY_APP_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("today");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  useEffect(() => {
    setState(loadAppState());
    setSelectedDate(todayISO());
    setHydrated(true);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (hydrated) {
      saveAppState(state);
    }
  }, [state, hydrated]);

  const isDark = state.profile.theme === "dark";

  const dayFoodLogs = useMemo(
    () => state.foodLogs.filter((l) => l.logDate === selectedDate),
    [state.foodLogs, selectedDate]
  );

  const dayTotals = useMemo(
    () => sumNutrients(dayFoodLogs.map((l) => l.nutrients)),
    [dayFoodLogs]
  );

  const daySteps = useMemo(
    () => state.steps.find((s) => s.logDate === selectedDate)?.steps ?? 0,
    [state.steps, selectedDate]
  );

  const dayWaterMl = useMemo(
    () =>
      state.waterLogs
        .filter((w) => w.logDate === selectedDate)
        .reduce((sum, w) => sum + w.amountMl, 0),
    [state.waterLogs, selectedDate]
  );

  const weightTrends = useMemo(
    () => analyzeWeightTrends(state.weights, state.profile.weightTrendThresholdKgWeek),
    [state.weights, state.profile.weightTrendThresholdKgWeek]
  );

  const fastingStatus = useMemo(
    () => computeAutomaticFasting(state.foodLogs, state.profile.fastingTargetHours),
    [state.foodLogs, state.profile.fastingTargetHours]
  );

  function shiftDate(deltaDays: number) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + deltaDays);
    setSelectedDate(d.toISOString().slice(0, 10));
  }

  function handleAddFoodLogs(newLogs: Omit<FoodLogEntry, "id">[]) {
    const created: FoodLogEntry[] = newLogs.map((l, idx) => ({
      ...l,
      id: `log-${Date.now()}-${idx}`,
    }));
    setState((prev) => ({
      ...prev,
      foodLogs: [...prev.foodLogs, ...created],
    }));
  }

  function handleDeleteFoodLog(id: string) {
    setState((prev) => ({
      ...prev,
      foodLogs: prev.foodLogs.filter((l) => l.id !== id),
    }));
  }

  function handleSaveCustomFood(food: FoodItem) {
    setState((prev) => {
      const exists = prev.foods.some(
        (f) => f.id === food.id || (food.barcode && f.barcode === food.barcode)
      );
      if (exists) return prev;
      return { ...prev, foods: [food, ...prev.foods] };
    });
  }

  function handleDuplicateYesterday() {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().slice(0, 10);
    const yesterdayLogs = state.foodLogs.filter((l) => l.logDate === yesterday);
    if (yesterdayLogs.length === 0) return;

    const duplicated: FoodLogEntry[] = yesterdayLogs.map((l, idx) => ({
      ...l,
      id: `dup-${Date.now()}-${idx}`,
      logDate: selectedDate,
      loggedAt: `${selectedDate}T${l.loggedAt.slice(11, 19)}`,
    }));

    setState((prev) => ({
      ...prev,
      foodLogs: [...prev.foodLogs, ...duplicated],
    }));
  }

  function handleLogWeight(date: string, weightKg: number) {
    setState((prev) => {
      const filtered = prev.weights.filter((w) => w.logDate !== date);
      return {
        ...prev,
        weights: [...filtered, { logDate: date, weightKg }].sort((a, b) =>
          a.logDate.localeCompare(b.logDate)
        ),
      };
    });
  }

  function handleLogSteps(date: string, steps: number) {
    setState((prev) => {
      const filtered = prev.steps.filter((s) => s.logDate !== date);
      return {
        ...prev,
        steps: [...filtered, { logDate: date, steps, source: "manual" as const }].sort((a, b) =>
          a.logDate.localeCompare(b.logDate)
        ),
      };
    });
  }

  function handleImportSteps(entries: StepEntry[]) {
    setState((prev) => {
      const map = new Map<string, StepEntry>();
      for (const s of prev.steps) map.set(s.logDate, s);
      for (const e of entries) map.set(e.logDate, e);
      return {
        ...prev,
        steps: Array.from(map.values()).sort((a, b) => a.logDate.localeCompare(b.logDate)),
      };
    });
  }

  function handleAddWater(amountMl: number) {
    setState((prev) => ({
      ...prev,
      waterLogs: [
        ...prev.waterLogs,
        {
          id: `water-${Date.now()}`,
          logDate: selectedDate,
          amountMl,
          loggedAt: new Date().toISOString(),
        },
      ],
    }));
  }

  function downloadFile(filename: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const kcalPct = Math.min(100, Math.round((dayTotals.kcal / Math.max(1, state.goals.targetKcal)) * 100));
  const kcalRemaining = state.goals.targetKcal - dayTotals.kcal;

  return (
    <div
      className={`min-h-screen pb-24 transition-colors ${
        isDark ? "bg-zinc-950 text-zinc-100" : "bg-zinc-50 text-zinc-900"
      }`}
    >
      {/* Header */}
      <header
        className={`sticky top-0 z-30 backdrop-blur-md border-b ${
          isDark ? "bg-zinc-950/85 border-zinc-900" : "bg-white/85 border-zinc-200"
        }`}
      >
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-sm">
              M
            </div>
            <div>
              <h1 className="font-semibold text-sm sm:text-base leading-tight">MacroPulse</h1>
              <p className="text-[11px] text-zinc-400">
                Jeûne auto : {fastingStatus.currentFastHours.toFixed(1)}h / {state.profile.fastingTargetHours}h
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  profile: { ...prev.profile, theme: isDark ? "light" : "dark" },
                }))
              }
              className={`p-2 rounded-xl border ${
                isDark
                  ? "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                  : "bg-zinc-100 border-zinc-200 text-zinc-700 hover:bg-zinc-200"
              }`}
              title="Changer de thème"
            >
              {isDark ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-3xl mx-auto px-4 pt-5 space-y-5">
        {activeTab === "today" && (
          <>
            {/* Sélecteur de date */}
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1 rounded-2xl bg-zinc-900/80 border border-zinc-800 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => shiftDate(-1)}
                  className="px-2.5 py-1.5 rounded-xl hover:bg-zinc-800 text-zinc-300"
                >
                  ←
                </button>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent px-2 py-1 font-mono text-zinc-100 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => shiftDate(1)}
                  className="px-2.5 py-1.5 rounded-xl hover:bg-zinc-800 text-zinc-300"
                >
                  →
                </button>
              </div>

              <button
                type="button"
                onClick={handleDuplicateYesterday}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300"
              >
                <CopyIcon className="w-3.5 h-3.5 text-emerald-400" />
                Dupliquer hier
              </button>
            </div>

            {/* Carte Kcal & Macros */}
            <section className="rounded-3xl bg-zinc-900/80 border border-zinc-800 p-5 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-zinc-400 uppercase tracking-wider">Calories du jour</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl font-bold font-mono text-emerald-400">
                      {dayTotals.kcal}
                    </span>
                    <span className="text-sm text-zinc-400 font-mono">
                      / {state.goals.targetKcal} kcal
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {kcalRemaining >= 0
                      ? `Reste ${kcalRemaining} kcal`
                      : `Dépassement de ${Math.abs(kcalRemaining)} kcal`}
                  </p>
                </div>

                {/* Anneau progression */}
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      fill="none"
                      stroke="currentColor"
                      className="text-zinc-800"
                      strokeWidth="6"
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${(kcalPct / 100) * 163.3} 163.3`}
                    />
                  </svg>
                  <span className="absolute text-xs font-mono font-semibold">{kcalPct}%</span>
                </div>
              </div>

              {/* Macros */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  {
                    label: "Protéines",
                    val: dayTotals.proteinG,
                    target: state.goals.proteinG,
                    bar: "bg-emerald-500",
                  },
                  {
                    label: "Glucides",
                    val: dayTotals.carbsG,
                    target: state.goals.carbsG,
                    bar: "bg-sky-500",
                  },
                  {
                    label: "Lipides",
                    val: dayTotals.fatG,
                    target: state.goals.fatG,
                    bar: "bg-amber-500",
                  },
                ].map((m) => {
                  const pct = Math.min(100, Math.round((m.val / Math.max(1, m.target)) * 100));
                  return (
                    <div key={m.label} className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-400">{m.label}</span>
                        <span className="font-mono">
                          {m.val}/{m.target}g
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-zinc-950 overflow-hidden">
                        <div className={`h-full ${m.bar}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Micronutriments épinglés */}
              {state.profile.pinnedMicronutrients.length > 0 && (
                <div className="pt-3 border-t border-zinc-800/80">
                  <p className="text-[11px] text-zinc-400 mb-2">Nutriments & micronutriments épinglés</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {state.profile.pinnedMicronutrients.map((key) => {
                      const meta = MICRONUTRIENT_CATALOG.find((c) => c.key === key);
                      if (!meta) return null;
                      const val = dayTotals.micronutrients[key] ?? 0;
                      const target = state.goals.micronutrientTargets[key] ?? meta.defaultTarget;
                      return (
                        <div
                          key={key}
                          className="rounded-xl bg-zinc-950 border border-zinc-800/80 px-2.5 py-2 text-xs"
                        >
                          <div className="text-zinc-400 truncate">{meta.label}</div>
                          <div className="font-mono font-semibold mt-0.5">
                            {val} <span className="text-zinc-500 font-normal">/ {target}{meta.unit}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* Cartes rapides Poids / Pas / Hydratation */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Poids */}
              <div
                onClick={() => setActiveTab("analytics")}
                className="cursor-pointer rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 p-4 space-y-1"
              >
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="inline-flex items-center gap-1.5">
                    <ScaleIcon className="w-4 h-4 text-emerald-400" /> Poids & Tendance
                  </span>
                  <span className="text-emerald-400 capitalize">{weightTrends.status3}</span>
                </div>
                <div className="text-xl font-bold font-mono">
                  {weightTrends.latestWeight ? `${weightTrends.latestWeight} kg` : "—"}
                </div>
                <p className="text-[11px] text-zinc-500">
                  3j: {weightTrends.ma3Latest ?? "—"} · 5j: {weightTrends.ma5Latest ?? "—"}
                </p>
              </div>

              {/* Pas */}
              <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="inline-flex items-center gap-1.5">
                    <FootprintsIcon className="w-4 h-4 text-sky-400" /> Pas
                  </span>
                  <span className="font-mono">
                    {daySteps.toLocaleString("fr-FR")} / {state.goals.targetSteps.toLocaleString("fr-FR")}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {[1000, 2500].map((inc) => (
                    <button
                      key={inc}
                      type="button"
                      onClick={() => handleLogSteps(selectedDate, daySteps + inc)}
                      className="flex-1 py-1 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-sky-500/50 text-[11px] font-mono text-sky-300"
                    >
                      +{inc}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hydratation */}
              <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="inline-flex items-center gap-1.5">
                    <DropletIcon className="w-4 h-4 text-cyan-400" /> Hydratation
                  </span>
                  <span className="font-mono">
                    {dayWaterMl} / {state.goals.targetWaterMl} ml
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {[250, 500].map((ml) => (
                    <button
                      key={ml}
                      type="button"
                      onClick={() => handleAddWater(ml)}
                      className="flex-1 py-1 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-cyan-500/50 text-[11px] font-mono text-cyan-300"
                    >
                      +{ml} ml
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Journal des repas */}
            <section className="space-y-3">
              {MEAL_LABELS.map(({ slot, label }) => {
                const items = dayFoodLogs.filter((l) => l.mealSlot === slot);
                const slotKcal = items.reduce((s, i) => s + i.nutrients.kcal, 0);
                return (
                  <div
                    key={slot}
                    className="rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{label}</h3>
                      <span className="text-xs font-mono text-zinc-400">{slotKcal} kcal</span>
                    </div>
                    {items.length === 0 ? (
                      <p className="text-xs text-zinc-500">Aucun aliment enregistré.</p>
                    ) : (
                      <div className="divide-y divide-zinc-800/70">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className="py-2 flex items-center justify-between gap-2 text-xs"
                          >
                            <div>
                              <p className="font-medium text-zinc-200">{item.foodName}</p>
                              <p className="text-[11px] text-zinc-500">
                                {item.quantityG} g · P {item.nutrients.proteinG}g · G{" "}
                                {item.nutrients.carbsG}g · L {item.nutrients.fatG}g ·{" "}
                                {item.loggedAt.slice(11, 16)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-emerald-400 font-semibold">
                                {item.nutrients.kcal}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteFoodLog(item.id)}
                                className="text-zinc-500 hover:text-rose-400 p-1"
                                title="Supprimer"
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          </>
        )}

        {activeTab === "analytics" && (
          <AnalyticsView
            weights={state.weights}
            steps={state.steps}
            foodLogs={state.foodLogs}
            goals={state.goals}
            trendThresholdKgWeek={state.profile.weightTrendThresholdKgWeek}
            selectedDate={selectedDate}
            onLogWeight={handleLogWeight}
            onLogSteps={handleLogSteps}
            onImportSteps={handleImportSteps}
          />
        )}

        {activeTab === "fasting" && (
          <FastingView
            foodLogs={state.foodLogs}
            fastingTargetHours={state.profile.fastingTargetHours}
            onChangeTargetHours={(h) =>
              setState((prev) => ({
                ...prev,
                profile: { ...prev.profile, fastingTargetHours: h },
              }))
            }
          />
        )}

        {activeTab === "goals" && (
          <GoalsTdeeView
            profile={state.profile}
            goals={state.goals}
            weights={state.weights}
            foodLogs={state.foodLogs}
            onUpdateProfile={(patch) =>
              setState((prev) => ({ ...prev, profile: { ...prev.profile, ...patch } }))
            }
            onUpdateGoals={(patch) =>
              setState((prev) => ({ ...prev, goals: { ...prev.goals, ...patch } }))
            }
            onExportJSON={() =>
              downloadFile(
                `macropulse-${todayISO()}.json`,
                exportAppStateAsJSON(state),
                "application/json"
              )
            }
            onExportCSV={() =>
              downloadFile(
                `macropulse-repas-${todayISO()}.csv`,
                exportFoodLogsAsCSV(state.foodLogs),
                "text/csv"
              )
            }
            onResetDemo={() => setState(createInitialDemoState())}
          />
        )}
      </main>

      {/* Bottom Navigation Bar avec bouton central '+' */}
      <nav
        className={`fixed bottom-0 inset-x-0 z-40 border-t backdrop-blur-md ${
          isDark ? "bg-zinc-950/90 border-zinc-800" : "bg-white/90 border-zinc-200"
        }`}
      >
        <div className="max-w-3xl mx-auto px-3 py-2 grid grid-cols-5 items-center">
          <button
            type="button"
            onClick={() => setActiveTab("today")}
            className={`flex flex-col items-center gap-0.5 py-1 text-[11px] ${
              activeTab === "today" ? "text-emerald-400 font-semibold" : "text-zinc-500"
            }`}
          >
            <HomeIcon className="w-5 h-5" />
            <span>Journal</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("analytics")}
            className={`flex flex-col items-center gap-0.5 py-1 text-[11px] ${
              activeTab === "analytics" ? "text-emerald-400 font-semibold" : "text-zinc-500"
            }`}
          >
            <ChartIcon className="w-5 h-5" />
            <span>Courbes</span>
          </button>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setQuickAddOpen(true)}
              className="-mt-6 w-14 h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-500/25 flex items-center justify-center transition transform active:scale-95"
              title="Ajout rapide (Scan / Photo IA / Texte IA / Manuel)"
            >
              <PlusIcon className="w-7 h-7" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("fasting")}
            className={`flex flex-col items-center gap-0.5 py-1 text-[11px] ${
              activeTab === "fasting" ? "text-emerald-400 font-semibold" : "text-zinc-500"
            }`}
          >
            <ClockIcon className="w-5 h-5" />
            <span>Jeûne</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("goals")}
            className={`flex flex-col items-center gap-0.5 py-1 text-[11px] ${
              activeTab === "goals" ? "text-emerald-400 font-semibold" : "text-zinc-500"
            }`}
          >
            <SettingsIcon className="w-5 h-5" />
            <span>Objectifs</span>
          </button>
        </div>
      </nav>

      <QuickAddModal
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        selectedDate={selectedDate}
        foods={state.foods}
        recipes={state.recipes}
        onAddFoodLogs={handleAddFoodLogs}
        onSaveCustomFood={handleSaveCustomFood}
      />
    </div>
  );
}
