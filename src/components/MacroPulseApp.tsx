"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  analyzeWeightTrends,
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
  Recipe,
  StepEntry,
} from "@/lib/types";
import { AnalyticsView } from "./AnalyticsView";
import { GoalsTdeeView } from "./GoalsTdeeView";
import {
  BarcodeIcon,
  ChartIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  DropletIcon,
  FlameIcon,
  FootprintsIcon,
  HomeIcon,
  MoonIcon,
  PencilIcon,
  PlusIcon,
  ScaleIcon,
  SearchIcon,
  SparklesIcon,
  SunIcon,
  SwapIcon,
  TrashIcon,
  UserIcon,
  XIcon,
} from "./Icons";
import { QuickAddModal, QuickAddTabMode } from "./QuickAddModal";
import { ProfileMenuModal } from "./ProfileMenuModal";
import { FoodLogDetailModal } from "./FoodLogDetailModal";

type ActiveTab = "today" | "analytics" | "goals";

const MEAL_LABELS: { slot: MealSlot; label: string }[] = [
  { slot: "breakfast", label: "Petit déjeuner" },
  { slot: "lunch", label: "Déjeuner" },
  { slot: "dinner", label: "Dîner" },
  { slot: "snack", label: "Snacks" },
];

const WEEKDAY_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

function formatDateHeader(iso: string): string {
  if (!iso) return "Aujourd'hui";
  const today = todayISO();
  if (iso === today) return "Aujourd'hui";
  const d = new Date(`${iso}T12:00:00`);
  const t = new Date(`${today}T12:00:00`);
  const diffDays = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diffDays === -1) return "Hier";
  if (diffDays === 1) return "Demain";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function getWeekDaysISO(centerISO: string): string[] {
  if (!centerISO) return [];
  const base = new Date(`${centerISO}T12:00:00`);
  const day = base.getDay(); // 0=Sun..6=Sat
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + diffToMon);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export function MacroPulseApp() {
  const [state, setState] = useState<AppState>(EMPTY_APP_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("today");
  const [selectedDate, setSelectedDate] = useState<string>("");

  // Modals & UI toggles
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FoodLogEntry | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<string>("");
  const [showMicronutrients, setShowMicronutrients] = useState(false);
  const [showFullJournal, setShowFullJournal] = useState(false);
  const [expandedMeals, setExpandedMeals] = useState<Record<MealSlot, boolean>>({
    breakfast: false,
    lunch: false,
    dinner: false,
    snack: false,
  });
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTab, setQuickAddTab] = useState<QuickAddTabMode>("all");
  const [quickAddSlot, setQuickAddSlot] = useState<MealSlot>("lunch");

  useEffect(() => {
    const today = todayISO();
    setState(loadAppState());
    setSelectedDate(today);
    setCalendarMonth(today.slice(0, 7));
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

  const loggedDatesSet = useMemo(
    () => new Set(state.foodLogs.map((l) => l.logDate)),
    [state.foodLogs]
  );

  const weekDays = useMemo(() => getWeekDaysISO(selectedDate), [selectedDate]);

  const streakCount = useMemo(() => {
    if (!hydrated || loggedDatesSet.size === 0) return 0;
    const today = todayISO();
    let count = 0;
    const cursor = new Date(`${today}T12:00:00`);
    // If today isn't logged yet, allow streak up to yesterday
    if (!loggedDatesSet.has(today)) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (loggedDatesSet.has(cursor.toISOString().slice(0, 10))) {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }, [hydrated, loggedDatesSet]);

  function openQuickAdd(tab: QuickAddTabMode = "all", slot: MealSlot = "lunch") {
    setAddSheetOpen(false);
    setQuickAddTab(tab);
    setQuickAddSlot(slot);
    setQuickAddOpen(true);
  }

  function shiftDate(deltaDays: number) {
    const d = new Date(`${selectedDate || todayISO()}T12:00:00`);
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

  function handleUpdateFoodLog(updated: FoodLogEntry) {
    setState((prev) => ({
      ...prev,
      foodLogs: prev.foodLogs.map((l) => (l.id === updated.id ? updated : l)),
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

  function handleSaveRecipe(recipe: Recipe) {
    setState((prev) => {
      const exists = prev.recipes.some((r) => r.id === recipe.id);
      if (exists) {
        return {
          ...prev,
          recipes: prev.recipes.map((r) => (r.id === recipe.id ? recipe : r)),
        };
      }
      return { ...prev, recipes: [recipe, ...prev.recipes] };
    });
  }

  function handleDeleteRecipe(id: string) {
    setState((prev) => ({
      ...prev,
      recipes: prev.recipes.filter((r) => r.id !== id),
    }));
  }

  function handleDuplicateYesterday(slotFilter?: MealSlot) {
    const d = new Date(`${selectedDate || todayISO()}T12:00:00`);
    d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().slice(0, 10);
    const yesterdayLogs = state.foodLogs.filter(
      (l) => l.logDate === yesterday && (!slotFilter || l.mealSlot === slotFilter)
    );
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

  function handleUpdateNote(text: string) {
    setState((prev) => ({
      ...prev,
      dailyNotes: {
        ...(prev.dailyNotes ?? {}),
        [selectedDate]: text,
      },
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
  const dailyNote = state.dailyNotes?.[selectedDate] ?? "";

  const cardSurface = isDark
    ? "bg-gradient-to-b from-[#1c2233] to-[#151925] border-white/[0.08] shadow-[0_10px_28px_-10px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)]"
    : "bg-white border-zinc-200 shadow-sm";

  return (
    <div
      className={`min-h-screen pb-28 transition-colors ${
        isDark ? "bg-[#0f131d] text-zinc-100" : "bg-zinc-100 text-zinc-900"
      }`}
    >
      {/* Top Bar */}
      <header
        className={`sticky top-0 z-30 backdrop-blur-md ${
          isDark ? "bg-[#0f131d]/90" : "bg-zinc-100/90"
        }`}
      >
        <div className="max-w-xl mx-auto px-4 pt-3 pb-2 flex items-center justify-between gap-3">
          {activeTab === "today" ? (
            <button
              type="button"
              onClick={() => setDatePickerOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 text-2xl font-bold tracking-tight"
            >
              <span>{formatDateHeader(selectedDate)}</span>
              <ChevronDownIcon className="w-5 h-5 text-zinc-400 mt-0.5" />
            </button>
          ) : (
            <h1 className="text-2xl font-bold tracking-tight">
              {activeTab === "analytics"
                ? "Progression"
                : "Profil & Objectifs"}
            </h1>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  profile: { ...prev.profile, theme: isDark ? "light" : "dark" },
                }))
              }
              className={`w-9 h-9 rounded-full border flex items-center justify-center transition ${
                isDark
                  ? "bg-[#181d2a] border-white/10 text-zinc-300 hover:bg-[#22283a]"
                  : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50"
              }`}
              title="Changer de thème"
            >
              {isDark ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setProfileMenuOpen(true)}
              className={`w-9 h-9 rounded-full border flex items-center justify-center transition ${
                profileMenuOpen || activeTab === "goals"
                  ? "bg-blue-500 border-blue-400 text-white"
                  : isDark
                    ? "bg-[#181d2a] border-white/10 text-zinc-200 hover:bg-[#22283a]"
                    : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50"
              }`}
              title="Menu Profil"
            >
              <UserIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Date Picker Calendar Drawer */}
        {activeTab === "today" && datePickerOpen && calendarMonth && (() => {
          const [yearStr, monthStr] = calendarMonth.split("-");
          const year = Number(yearStr);
          const month = Number(monthStr); // 1..12
          const firstDay = new Date(year, month - 1, 1);
          const startWeekday = (firstDay.getDay() + 6) % 7; // 0=Mon..6=Sun
          const daysInMonth = new Date(year, month, 0).getDate();
          const todayStr = todayISO();
          const monthLabel = firstDay.toLocaleDateString("fr-FR", {
            month: "long",
            year: "numeric",
          });

          const shiftCalMonth = (delta: number) => {
            const d = new Date(year, month - 1 + delta, 1);
            setCalendarMonth(
              `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
            );
          };

          const cells: Array<{ day: number; iso: string } | null> = [];
          for (let i = 0; i < startWeekday; i++) cells.push(null);
          for (let d = 1; d <= daysInMonth; d++) {
            cells.push({
              day: d,
              iso: `${yearStr}-${monthStr}-${String(d).padStart(2, "0")}`,
            });
          }

          return (
            <div className="max-w-xl mx-auto px-4 pb-3">
              <div className={`rounded-2xl border p-3.5 space-y-3 ${cardSurface}`}>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => shiftCalMonth(-1)}
                    className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium"
                  >
                    ←
                  </button>
                  <span className="text-sm font-semibold capitalize">{monthLabel}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDate(todayStr);
                        setCalendarMonth(todayStr.slice(0, 7));
                        setDatePickerOpen(false);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-blue-500/15 text-blue-400 text-xs font-medium"
                    >
                      Aujourd&apos;hui
                    </button>
                    <button
                      type="button"
                      onClick={() => shiftCalMonth(1)}
                      className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium"
                    >
                      →
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-zinc-500 font-medium">
                  {["L", "M", "M", "J", "V", "S", "D"].map((lbl, i) => (
                    <div key={i} className="py-1">
                      {lbl}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1 text-center">
                  {cells.map((cell, idx) => {
                    if (!cell) return <div key={`empty-${idx}`} />;
                    const isSelected = cell.iso === selectedDate;
                    const isToday = cell.iso === todayStr;
                    const hasLogs = loggedDatesSet.has(cell.iso);
                    return (
                      <button
                        key={cell.iso}
                        type="button"
                        onClick={() => {
                          setSelectedDate(cell.iso);
                          setDatePickerOpen(false);
                        }}
                        className={`relative h-9 rounded-xl text-xs font-medium flex flex-col items-center justify-center transition ${
                          isSelected
                            ? "bg-blue-500 text-white font-semibold"
                            : isToday
                              ? "ring-1 ring-blue-400 text-blue-400 hover:bg-white/5"
                              : "hover:bg-white/5 text-zinc-200"
                        }`}
                      >
                        <span>{cell.day}</span>
                        {hasLogs && (
                          <span
                            className={`w-1 h-1 rounded-full mt-0.5 ${
                              isSelected ? "bg-white" : "bg-emerald-400"
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
      </header>

      {/* Main Content */}
      <main className="max-w-xl mx-auto px-4 pt-2 space-y-5">
        {activeTab === "today" && (
          <>
            {/* Weekly Streak Strip */}
            <section className="flex items-center justify-between gap-2 py-1">
              <div className="flex-1 grid grid-cols-7 gap-1 text-center">
                {weekDays.map((dayISO, idx) => {
                  const hasLogs = loggedDatesSet.has(dayISO);
                  const isSelected = dayISO === selectedDate;
                  return (
                    <button
                      key={dayISO}
                      type="button"
                      onClick={() => setSelectedDate(dayISO)}
                      className="flex flex-col items-center gap-1.5 group"
                    >
                      <span
                        className={`text-[11px] font-medium ${
                          isSelected ? "text-white font-bold" : "text-zinc-400"
                        }`}
                      >
                        {WEEKDAY_LETTERS[idx]}
                      </span>
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center transition ${
                          hasLogs
                            ? isSelected
                              ? "bg-blue-500 text-white ring-2 ring-blue-400/50"
                              : "bg-zinc-200 text-[#0f131d]"
                            : isSelected
                              ? "border-2 border-blue-400 bg-blue-500/15"
                              : "border border-zinc-600/70 group-hover:border-zinc-400"
                        }`}
                      >
                        {hasLogs && <CheckIcon className="w-3.5 h-3.5" />}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="pl-3 border-l border-white/10 flex items-center justify-center">
                <div className="relative flex items-center justify-center w-10 h-10 text-amber-300">
                  <FlameIcon className="w-9 h-9" />
                  <span className="absolute mt-1.5 text-[11px] font-bold text-[#0f131d]">
                    {streakCount}
                  </span>
                </div>
              </div>
            </section>

            {/* Calories Card */}
            <section className={`rounded-2xl border p-4 space-y-3 ${cardSurface}`}>
              <p className="text-sm font-medium text-zinc-300">Calories</p>
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tracking-tight">
                    {dayTotals.kcal.toLocaleString("fr-FR")} cal
                  </span>
                  <span className="text-sm text-zinc-400">
                    / {state.goals.targetKcal.toLocaleString("fr-FR")}
                  </span>
                  <span className="text-sm" aria-hidden="true">🔥</span>
                </div>
                <span className={`text-sm font-semibold ${kcalRemaining < 0 ? "text-rose-400" : "text-zinc-200"}`}>
                  {kcalRemaining >= 0
                    ? `${kcalRemaining.toLocaleString("fr-FR")} restants`
                    : `${Math.abs(kcalRemaining).toLocaleString("fr-FR")} dépassés`}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-[#242a3a] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    kcalRemaining < 0
                      ? "bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.45)]"
                      : "bg-gradient-to-r from-blue-500 to-sky-400 shadow-[0_0_12px_rgba(59,130,246,0.45)]"
                  }`}
                  style={{ width: `${kcalPct}%` }}
                />
              </div>
            </section>

            {/* Macros / Micronutrients Card */}
            <section className={`rounded-2xl border p-4 relative ${cardSurface}`}>
              <button
                type="button"
                onClick={() => setShowMicronutrients((v) => !v)}
                className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-300 transition"
                title={showMicronutrients ? "Voir les macros" : "Voir les micronutriments épinglés"}
              >
                <SwapIcon className="w-3.5 h-3.5" />
              </button>

              {!showMicronutrients ? (
                <div className="grid grid-cols-3 gap-3 pr-6">
                  {[
                    {
                      label: "Glucides",
                      val: dayTotals.carbsG,
                      target: state.goals.carbsG,
                      bar: "bg-teal-400",
                    },
                    {
                      label: "Lipides",
                      val: dayTotals.fatG,
                      target: state.goals.fatG,
                      bar: "bg-purple-400",
                    },
                    {
                      label: "Protéines",
                      val: dayTotals.proteinG,
                      target: state.goals.proteinG,
                      bar: "bg-amber-400",
                    },
                  ].map((m) => {
                    const pct = Math.min(100, Math.round((m.val / Math.max(1, m.target)) * 100));
                    return (
                      <div key={m.label} className="space-y-1.5">
                        <p className="text-xs text-zinc-400">{m.label}</p>
                        <p className="text-base font-bold leading-tight">
                          {Math.round(m.val)} g{" "}
                          <span className="text-xs font-normal text-zinc-400">/ {m.target}</span>
                        </p>
                        <div className="h-2 rounded-full bg-[#242a3a] overflow-hidden">
                          <div className={`h-full rounded-full ${m.bar}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2 pr-6">
                  <p className="text-xs font-medium text-zinc-400">Micronutriments épinglés</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {state.profile.pinnedMicronutrients.map((key) => {
                      const meta = MICRONUTRIENT_CATALOG.find((c) => c.key === key);
                      if (!meta) return null;
                      const val = dayTotals.micronutrients[key] ?? 0;
                      const target = state.goals.micronutrientTargets[key] ?? meta.defaultTarget;
                      return (
                        <div
                          key={key}
                          className="rounded-xl bg-white/[0.04] px-2.5 py-2 text-xs"
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

            {/* Repas Section */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Repas</h2>
                <button
                  type="button"
                  onClick={() => setShowFullJournal((v) => !v)}
                  className="text-sm font-semibold text-blue-400 hover:text-blue-300"
                >
                  {showFullJournal ? "Vue résumée" : "Voir le journal"}
                </button>
              </div>

              <div className="space-y-3">
                {MEAL_LABELS.map(({ slot, label }) => {
                  const items = dayFoodLogs.filter((l) => l.mealSlot === slot);
                  const slotKcal = items.reduce((s, i) => s + i.nutrients.kcal, 0);
                  const isExpanded = showFullJournal || expandedMeals[slot];

                  return (
                    <div key={slot} className={`rounded-2xl border p-4 space-y-2.5 ${cardSurface}`}>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-base font-medium">{label}</h3>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedMeals((prev) => ({ ...prev, [slot]: !prev[slot] }))
                            }
                            className="px-2 py-1 text-zinc-400 hover:text-zinc-200 text-sm tracking-widest"
                            title="Afficher / masquer le détail"
                          >
                            •••
                          </button>
                          <button
                            type="button"
                            onClick={() => openQuickAdd("all", slot)}
                            className="px-3.5 py-1.5 rounded-full bg-blue-500/15 hover:bg-blue-500/25 border border-blue-400/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] text-blue-400 text-xs font-semibold transition active:scale-[0.96]"
                          >
                            Consignez
                          </button>
                        </div>
                      </div>

                      {items.length === 0 ? (
                        <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
                          <p className="text-xs text-zinc-400">Aucun aliment consigné</p>
                          <button
                            type="button"
                            onClick={() => handleDuplicateYesterday(slot)}
                            className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:underline"
                          >
                            <CopyIcon className="w-3 h-3" /> Copier hier
                          </button>
                        </div>
                      ) : !isExpanded ? (
                        <div
                          onClick={() => {
                            if (items.length === 1) {
                              setEditingEntry(items[0]);
                            } else {
                              setExpandedMeals((prev) => ({ ...prev, [slot]: true }));
                            }
                          }}
                          className="cursor-pointer pt-1 text-xs text-zinc-400 space-y-0.5 hover:text-zinc-200 transition"
                        >
                          <p className="text-zinc-300 truncate">
                            {items[0].foodName}
                            {items.length > 1 ? ` et ${items.length - 1} de plus` : ""}
                          </p>
                          <p>{slotKcal} cal</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-white/[0.06] pt-1 border-t border-white/[0.05]">
                          {items.map((item) => (
                            <div
                              key={item.id}
                              onClick={() => setEditingEntry(item)}
                              className="cursor-pointer py-2 px-2 -mx-2 rounded-xl hover:bg-white/[0.04] flex items-center justify-between gap-2 text-xs transition"
                            >
                              <div className="min-w-0">
                                <p className="font-medium text-zinc-200 truncate">{item.foodName}</p>
                                <p className="text-[11px] text-zinc-400">
                                  {item.unitQuantity
                                    ? `${item.unitQuantity} ${item.unitLabel || "unité"} (${item.quantityG} g)`
                                    : `${item.quantityG} g`}{" "}
                                  · P {item.nutrients.proteinG}g · G{" "}
                                  {item.nutrients.carbsG}g · L {item.nutrients.fatG}g
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-mono text-blue-400 font-semibold">
                                  {item.nutrients.kcal} cal
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteFoodLog(item.id);
                                  }}
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
              </div>

              <div className="flex items-center justify-center gap-4 pt-1">
                <button
                  type="button"
                  onClick={() => setShowFullJournal((v) => !v)}
                  className="text-sm font-semibold text-blue-400 hover:text-blue-300"
                >
                  {showFullJournal ? "Réduire le journal" : "Journal complet"}
                </button>
                <span className="text-zinc-600">•</span>
                <button
                  type="button"
                  onClick={() => handleDuplicateYesterday()}
                  className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  <CopyIcon className="w-3.5 h-3.5" /> Dupliquer hier
                </button>
              </div>
            </section>

            {/* Habitudes saines */}
            <section className="space-y-2.5">
              <h2 className="text-lg font-bold">Habitudes saines</h2>
              <div className={`rounded-2xl border divide-y divide-white/[0.06] ${cardSurface}`}>
                {/* Eau */}
                <div className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Eau</p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {dayWaterMl} ml / {state.goals.targetWaterMl} ml
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[250, 500].map((ml) => (
                      <button
                        key={ml}
                        type="button"
                        onClick={() => handleAddWater(ml)}
                        className="px-2.5 py-1 rounded-full bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 text-xs font-semibold"
                      >
                        +{ml} ml
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pas */}
                <div className="p-4 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab("analytics")}
                    className="text-left flex-1"
                  >
                    <p className="text-sm font-semibold">Pas</p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {daySteps.toLocaleString("fr-FR")} pas aujourd&apos;hui
                    </p>
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleLogSteps(selectedDate, daySteps + 1000)}
                      className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-300"
                    >
                      +1 000
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("analytics")}
                      className="text-zinc-400 hover:text-zinc-200 p-1"
                      aria-label="Voir les pas"
                    >
                      <ChevronRightIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Poids */}
            <section className="space-y-2.5">
              <h2 className="text-lg font-bold">Poids</h2>
              <button
                type="button"
                onClick={() => setActiveTab("analytics")}
                className={`w-full rounded-2xl border p-4 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition ${cardSurface}`}
              >
                <div>
                  <p className="text-xl font-bold">
                    {weightTrends.latestWeight ? `${weightTrends.latestWeight} kg` : "—"}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    3j : {weightTrends.ma3Latest ?? "—"} · 5j : {weightTrends.ma5Latest ?? "—"} ·{" "}
                    <span className="capitalize text-blue-400">{weightTrends.status3}</span>
                  </p>
                </div>
                <ChevronRightIcon className="w-4 h-4 text-zinc-400 shrink-0" />
              </button>
            </section>

            {/* Notes */}
            <section className="space-y-2.5">
              <h2 className="text-lg font-bold">Notes</h2>
              <div className={`rounded-2xl border px-4 py-3 flex items-center gap-3 ${cardSurface}`}>
                <input
                  type="text"
                  value={dailyNote}
                  onChange={(e) => handleUpdateNote(e.target.value)}
                  placeholder="Ajouter une remarque"
                  className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                />
                <PencilIcon className="w-4 h-4 text-zinc-400 shrink-0" />
              </div>
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
            onClearAllData={() =>
              setState((prev) => ({
                ...prev,
                foods: [],
                recipes: [],
                foodLogs: [],
                weights: [],
                steps: [],
                waterLogs: [],
              }))
            }
          />
        )}
      </main>

      {/* Floating Bottom Navigation (Aujourd'hui / Progression + FAB '+') */}
      <nav className="fixed bottom-4 inset-x-0 z-40 px-4 pointer-events-none">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <div
            className={`pointer-events-auto flex-1 rounded-full border backdrop-blur-xl p-1.5 grid grid-cols-2 shadow-xl ${
              isDark
                ? "bg-[#1b202e]/85 border-white/10"
                : "bg-white/90 border-zinc-200"
            }`}
          >
            <button
              type="button"
              onClick={() => setActiveTab("today")}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-full text-[11px] font-medium transition ${
                activeTab === "today"
                  ? isDark
                    ? "bg-[#282f42] text-white"
                    : "bg-zinc-900 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <HomeIcon className="w-5 h-5" />
              <span>Aujourd&apos;hui</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("analytics")}
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-full text-[11px] font-medium transition ${
                activeTab === "analytics"
                  ? isDark
                    ? "bg-[#282f42] text-white"
                    : "bg-zinc-900 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <ChartIcon className="w-5 h-5" />
              <span>Progression</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setAddSheetOpen(true)}
            className="pointer-events-auto w-14 h-14 rounded-full bg-gradient-to-b from-blue-400 to-blue-600 hover:from-blue-300 hover:to-blue-500 text-white shadow-[0_8px_24px_-4px_rgba(59,130,246,0.6),inset_0_1px_0_rgba(255,255,255,0.35)] flex items-center justify-center transition transform active:scale-95 shrink-0"
            title="Ajouter un aliment, scanner un code-barres ou suivre une habitude"
          >
            <PlusIcon className="w-7 h-7" />
          </button>
        </div>
      </nav>

      {/* Bottom Action Sheet on '+' click */}
      {addSheetOpen && (
        <div
          onClick={() => setAddSheetOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-[#1b202e]/95 border border-white/15 p-4 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-bold text-blue-400">MacroPulse</span>
              <button
                type="button"
                onClick={() => setAddSheetOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-200"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => openQuickAdd("all", "lunch")}
                className="flex flex-col items-center justify-center gap-2.5 py-6 px-3 rounded-2xl bg-[#252b3d] hover:bg-[#2d354b] transition"
              >
                <span className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white">
                  <SearchIcon className="w-5 h-5" />
                </span>
                <span className="text-xs font-semibold text-zinc-100 text-center">
                  Consigner un aliment
                </span>
              </button>

              <button
                type="button"
                onClick={() => openQuickAdd("barcode", "lunch")}
                className="flex flex-col items-center justify-center gap-2.5 py-6 px-3 rounded-2xl bg-[#252b3d] hover:bg-[#2d354b] transition"
              >
                <span className="w-10 h-10 rounded-full bg-rose-500 flex items-center justify-center text-white">
                  <BarcodeIcon className="w-5 h-5" />
                </span>
                <span className="text-xs font-semibold text-zinc-100 text-center">
                  Scan de code-barres
                </span>
              </button>
            </div>

            <div className="rounded-2xl bg-[#252b3d] divide-y divide-white/[0.06] overflow-hidden">
              <button
                type="button"
                onClick={() => openQuickAdd("photo", "lunch")}
                className="w-full px-4 py-3 flex items-center gap-3 text-sm font-medium text-zinc-100 hover:bg-white/[0.04] transition"
              >
                <SparklesIcon className="w-4 h-4 text-emerald-400" />
                <span>Photo / Texte IA (Gemini)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleAddWater(250);
                  setAddSheetOpen(false);
                }}
                className="w-full px-4 py-3 flex items-center gap-3 text-sm font-medium text-zinc-100 hover:bg-white/[0.04] transition"
              >
                <DropletIcon className="w-4 h-4 text-blue-400" />
                <span>Eau (+250 ml)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddSheetOpen(false);
                  setActiveTab("analytics");
                }}
                className="w-full px-4 py-3 flex items-center gap-3 text-sm font-medium text-zinc-100 hover:bg-white/[0.04] transition"
              >
                <ScaleIcon className="w-4 h-4 text-emerald-400" />
                <span>Poids & Pas</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <QuickAddModal
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        selectedDate={selectedDate}
        foods={state.foods}
        recipes={state.recipes}
        foodLogs={state.foodLogs}
        initialTab={quickAddTab}
        initialMealSlot={quickAddSlot}
        onAddFoodLogs={handleAddFoodLogs}
        onSaveCustomFood={handleSaveCustomFood}
        onSaveRecipe={handleSaveRecipe}
        onDeleteRecipe={handleDeleteRecipe}
      />

      <ProfileMenuModal
        open={profileMenuOpen}
        onClose={() => setProfileMenuOpen(false)}
        displayName={state.profile.displayName}
        streakCount={streakCount}
        weights={state.weights}
        isDark={isDark}
        onToggleTheme={() =>
          setState((prev) => ({
            ...prev,
            profile: { ...prev.profile, theme: isDark ? "light" : "dark" },
          }))
        }
        onNavigate={(tab) => setActiveTab(tab)}
        onOpenFoods={() => openQuickAdd("foods")}
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
        onClearAllData={() =>
          setState((prev) => ({
            ...prev,
            foods: [],
            recipes: [],
            foodLogs: [],
            weights: [],
            steps: [],
            waterLogs: [],
          }))
        }
      />

      <FoodLogDetailModal
        entry={editingEntry}
        recipes={state.recipes}
        onClose={() => setEditingEntry(null)}
        onSave={handleUpdateFoodLog}
        onDelete={handleDeleteFoodLog}
      />
    </div>
  );
}
