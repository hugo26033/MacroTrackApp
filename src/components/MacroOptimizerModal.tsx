"use client";

import React, { useMemo, useState } from "react";
import { scaleNutrients } from "@/lib/calculations";
import {
  MacroTarget,
  OptimizerItem,
  optimizeMealQuantities,
} from "@/lib/optimizer";
import type {
  FoodItem,
  FoodLogEntry,
  MealSlot,
  NutrientValues,
  NutritionGoals,
  Recipe,
} from "@/lib/types";
import { PlusIcon, SparklesIcon, TrashIcon, XIcon } from "./Icons";

interface MacroOptimizerModalProps {
  open: boolean;
  onClose: () => void;
  selectedDate: string;
  goals: NutritionGoals;
  dayTotals: NutrientValues;
  foods: FoodItem[];
  recipes: Recipe[];
  onApplyLogs: (logs: Omit<FoodLogEntry, "id">[]) => void;
}

const MEAL_SLOTS: { value: MealSlot; label: string }[] = [
  { value: "breakfast", label: "Petit déj" },
  { value: "lunch", label: "Déjeuner" },
  { value: "dinner", label: "Dîner" },
  { value: "snack", label: "Collation" },
];

export function MacroOptimizerModal({
  open,
  onClose,
  selectedDate,
  goals,
  dayTotals,
  foods,
  recipes,
  onApplyLogs,
}: MacroOptimizerModalProps) {
  const [mode, setMode] = useState<"complete" | "plan_day">("complete");
  const [defaultSlot, setDefaultSlot] = useState<MealSlot>("dinner");
  const [items, setItems] = useState<OptimizerItem[]>([]);
  const [foodSearch, setFoodSearch] = useState("");
  const [aiPreference, setAiPreference] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const target: MacroTarget = useMemo(() => {
    if (mode === "plan_day") {
      return {
        kcal: goals.targetKcal,
        proteinG: goals.proteinG,
        carbsG: goals.carbsG,
        fatG: goals.fatG,
      };
    }
    return {
      kcal: Math.max(0, goals.targetKcal - dayTotals.kcal),
      proteinG: Math.max(0, Math.round((goals.proteinG - dayTotals.proteinG) * 10) / 10),
      carbsG: Math.max(0, Math.round((goals.carbsG - dayTotals.carbsG) * 10) / 10),
      fatG: Math.max(0, Math.round((goals.fatG - dayTotals.fatG) * 10) / 10),
    };
  }, [mode, goals, dayTotals]);

  const solved = useMemo(() => optimizeMealQuantities(items, target), [items, target]);

  if (!open) return null;

  const filteredFoods = foods.filter((f) =>
    f.name.toLowerCase().includes(foodSearch.trim().toLowerCase())
  );
  const filteredRecipes = recipes.filter((r) =>
    r.name.toLowerCase().includes(foodSearch.trim().toLowerCase())
  );

  function addFoodItem(food: FoodItem) {
    const isUnit = food.unitType === "unit" && food.servingSizeG > 0;
    const minG = isUnit ? food.servingSizeG * 0.5 : 20;
    const maxG = isUnit ? food.servingSizeG * 5 : 350;
    const newItem: OptimizerItem = {
      id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: food.name,
      mealSlot: defaultSlot,
      per100g: food.per100g,
      unitType: food.unitType,
      unitWeightG: isUnit ? food.servingSizeG : undefined,
      unitLabel: food.unitLabel,
      minG,
      maxG,
      locked: false,
      quantityG: food.servingSizeG || 100,
    };
    setItems((prev) => [...prev, newItem]);
  }

  function addRecipeItem(recipe: Recipe) {
    const totalG = Math.max(
      50,
      recipe.items.reduce((s, i) => s + i.quantityG, 0) / Math.max(1, recipe.servings)
    );
    const factor = 100 / totalG;
    const per100g: NutrientValues = {
      kcal: Math.round(recipe.perServing.kcal * factor),
      proteinG: Math.round(recipe.perServing.proteinG * factor * 10) / 10,
      carbsG: Math.round(recipe.perServing.carbsG * factor * 10) / 10,
      fatG: Math.round(recipe.perServing.fatG * factor * 10) / 10,
      micronutrients: {},
    };
    const newItem: OptimizerItem = {
      id: `opt-rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: recipe.name,
      mealSlot: defaultSlot,
      per100g,
      minG: Math.round(totalG * 0.5),
      maxG: Math.round(totalG * 2),
      locked: false,
      quantityG: Math.round(totalG),
    };
    setItems((prev) => [...prev, newItem]);
  }

  async function handleSuggestWithGemini() {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai/suggest-meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: mode === "plan_day" ? "plan_day" : "complete",
          target,
          preference: aiPreference,
          mealSlot: defaultSlot,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || "Erreur Gemini.");
        return;
      }
      const suggested = Array.isArray(data.foods) ? data.foods : [];
      const mapped: OptimizerItem[] = suggested.map(
        (
          f: {
            name: string;
            mealSlot?: MealSlot;
            kcalPer100g: number;
            proteinPer100g: number;
            carbsPer100g: number;
            fatPer100g: number;
            fiberPer100g?: number;
            minG?: number;
            maxG?: number;
          },
          idx: number
        ) => ({
          id: `opt-ai-${Date.now()}-${idx}`,
          name: f.name,
          mealSlot: mode === "plan_day" ? f.mealSlot || "lunch" : defaultSlot,
          per100g: {
            kcal: f.kcalPer100g,
            proteinG: f.proteinPer100g,
            carbsG: f.carbsPer100g,
            fatG: f.fatPer100g,
            micronutrients: { fiber_g: f.fiberPer100g ?? 0 },
          },
          minG: Math.max(5, f.minG ?? 30),
          maxG: Math.max(20, f.maxG ?? 300),
          locked: false,
          quantityG: Math.round(((f.minG ?? 30) + (f.maxG ?? 300)) / 2),
        })
      );
      setItems(mapped);
    } catch {
      setAiError("Impossible de joindre Gemini.");
    } finally {
      setAiLoading(false);
    }
  }

  function updateItem(id: string, patch: Partial<OptimizerItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function handleApplyToJournal() {
    if (solved.items.length === 0) return;
    const nowIso = new Date().toISOString();
    const logs: Omit<FoodLogEntry, "id">[] = solved.items.map((it) => {
      const scaled = scaleNutrients(it.per100g, it.quantityG);
      const isUnit = it.unitType === "unit" && it.unitWeightG && it.unitWeightG > 0;
      const unitCount = isUnit
        ? Math.round((it.quantityG / it.unitWeightG!) * 10) / 10
        : undefined;
      return {
        logDate: selectedDate,
        loggedAt: nowIso,
        mealSlot: mode === "plan_day" ? it.mealSlot : defaultSlot,
        foodName: it.name,
        quantityG: it.quantityG,
        ...(isUnit
          ? {
              unitQuantity: unitCount,
              unitLabel: it.unitLabel || "unité",
              unitWeightG: it.unitWeightG,
            }
          : {}),
        nutrients: scaled,
        source: "manual",
      };
    });
    onApplyLogs(logs);
    onClose();
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-gradient-to-b from-[#1a2030] to-[#121622] border border-white/[0.08] text-zinc-100 shadow-2xl p-5 space-y-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <SparklesIcon className="w-5 h-5 text-blue-400" />
              Optimiseur Macros & Kcal
            </h2>
            <p className="text-xs text-zinc-400">
              Priorité : Calories → Protéines → Lipides → Glucides
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-300"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-1.5 bg-[#0f131d] p-1 rounded-2xl border border-white/[0.06]">
          <button
            type="button"
            onClick={() => setMode("complete")}
            className={`py-2 rounded-xl text-xs font-semibold transition ${
              mode === "complete"
                ? "bg-blue-500 text-white shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Compléter le reste du jour
          </button>
          <button
            type="button"
            onClick={() => setMode("plan_day")}
            className={`py-2 rounded-xl text-xs font-semibold transition ${
              mode === "plan_day"
                ? "bg-blue-500 text-white shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Planifier toute la journée
          </button>
        </div>

        {mode === "complete" && (
          <div className="grid grid-cols-4 gap-1.5">
            {MEAL_SLOTS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setDefaultSlot(s.value)}
                className={`py-1.5 rounded-xl text-xs font-medium border transition ${
                  defaultSlot === s.value
                    ? "bg-blue-500/20 border-blue-400/40 text-blue-300"
                    : "bg-[#0f131d] border-white/[0.06] text-zinc-400"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Cible vs Résultat en direct */}
        <div className="rounded-2xl bg-[#0f131d] border border-white/[0.06] p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">
              Cible : <strong className="font-mono text-zinc-200">{Math.round(target.kcal)} kcal</strong>{" "}
              · P {Math.round(target.proteinG)}g · L {Math.round(target.fatG)}g · G{" "}
              {Math.round(target.carbsG)}g
            </span>
            {items.length > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold ${
                  solved.matchPct >= 95
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-amber-500/15 text-amber-300"
                }`}
              >
                {solved.matchPct}% match
              </span>
            )}
          </div>
          {items.length > 0 && (
            <div className="text-xs font-mono text-blue-400">
              Calculé : <strong>{solved.totals.kcal} kcal</strong> ({solved.deltas.kcal >= 0 ? "+" : ""}
              {solved.deltas.kcal}) · P {solved.totals.proteinG}g · L {solved.totals.fatG}g · G{" "}
              {solved.totals.carbsG}g
            </div>
          )}
        </div>

        {/* Suggestion Gemini */}
        <div className="rounded-2xl bg-[#0f131d] border border-white/[0.06] p-3 space-y-2">
          <p className="text-xs font-medium text-zinc-300">
            ✨ Suggestion intelligente Gemini (optionnel)
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={aiPreference}
              onChange={(e) => setAiPreference(e.target.value)}
              placeholder="Ex: poulet, riz, œufs, skyr (ou laisse vide)"
              className="flex-1 rounded-xl bg-[#181d2a] border border-white/10 px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
            />
            <button
              type="button"
              disabled={aiLoading}
              onClick={handleSuggestWithGemini}
              className="px-3.5 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-xs font-semibold disabled:opacity-50 shrink-0"
            >
              {aiLoading ? "..." : "Suggérer"}
            </button>
          </div>
          {aiError && <p className="text-xs text-amber-400">{aiError}</p>}
        </div>

        {/* Picker Mes aliments / Recettes */}
        <div className="space-y-2">
          <input
            type="text"
            value={foodSearch}
            onChange={(e) => setFoodSearch(e.target.value)}
            placeholder="Ajouter un aliment ou recette de ta base..."
            className="w-full rounded-xl bg-[#0f131d] border border-white/10 px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
          />
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {filteredRecipes.slice(0, 6).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => addRecipeItem(r)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[11px] hover:bg-purple-500/25"
              >
                <PlusIcon className="w-3 h-3" /> {r.name}
              </button>
            ))}
            {filteredFoods.slice(0, 10).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => addFoodItem(f)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-200 text-[11px] hover:bg-white/10"
              >
                <PlusIcon className="w-3 h-3 text-blue-400" /> {f.name}
              </button>
            ))}
          </div>
        </div>

        {/* Liste des aliments optimisés */}
        {solved.items.length > 0 && (
          <div className="space-y-2.5">
            {solved.items.map((item) => {
              const scaled = scaleNutrients(item.per100g, item.quantityG);
              const isUnit = item.unitType === "unit" && item.unitWeightG;
              const unitCount = isUnit
                ? Math.round((item.quantityG / item.unitWeightG!) * 10) / 10
                : null;

              return (
                <div
                  key={item.id}
                  className="rounded-2xl bg-[#0f131d] border border-white/[0.06] p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{item.name}</p>
                      <p className="text-[11px] text-zinc-400 font-mono">
                        {scaled.kcal} kcal · P {scaled.proteinG}g · L {scaled.fatG}g · G{" "}
                        {scaled.carbsG}g
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-2.5 py-1 rounded-xl bg-blue-500/15 text-blue-300 font-mono text-xs font-bold">
                        {isUnit ? `${unitCount} ${item.unitLabel || "u"} (${item.quantityG}g)` : `${item.quantityG} g`}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateItem(item.id, { locked: !item.locked })}
                        className={`px-2 py-1 rounded-xl text-[11px] border ${
                          item.locked
                            ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                            : "bg-white/5 border-white/10 text-zinc-400"
                        }`}
                        title={item.locked ? "Déverrouiller" : "Verrouiller cette quantité"}
                      >
                        {item.locked ? "🔒" : "🔓"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
                        className="p-1 text-zinc-500 hover:text-rose-400"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                    {mode === "plan_day" && (
                      <select
                        value={item.mealSlot}
                        onChange={(e) =>
                          updateItem(item.id, { mealSlot: e.target.value as MealSlot })
                        }
                        className="rounded-lg bg-[#181d2a] border border-white/10 px-2 py-1 text-zinc-200"
                      >
                        {MEAL_SLOTS.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    )}

                    {item.locked ? (
                      <label className="inline-flex items-center gap-1">
                        <span>Fixé (g) :</span>
                        <input
                          type="number"
                          min={1}
                          value={item.quantityG}
                          onChange={(e) =>
                            updateItem(item.id, { quantityG: Math.max(1, Number(e.target.value)) })
                          }
                          className="w-16 rounded-lg bg-[#181d2a] border border-white/10 px-2 py-0.5 font-mono text-zinc-100"
                        />
                      </label>
                    ) : (
                      <>
                        <label className="inline-flex items-center gap-1">
                          <span>Min (g)</span>
                          <input
                            type="number"
                            min={0}
                            value={item.minG}
                            onChange={(e) =>
                              updateItem(item.id, { minG: Math.max(0, Number(e.target.value)) })
                            }
                            className="w-14 rounded-lg bg-[#181d2a] border border-white/10 px-1.5 py-0.5 font-mono text-zinc-200"
                          />
                        </label>
                        <label className="inline-flex items-center gap-1">
                          <span>Max (g)</span>
                          <input
                            type="number"
                            min={5}
                            value={item.maxG}
                            onChange={(e) =>
                              updateItem(item.id, { maxG: Math.max(5, Number(e.target.value)) })
                            }
                            className="w-14 rounded-lg bg-[#181d2a] border border-white/10 px-1.5 py-0.5 font-mono text-zinc-200"
                          />
                        </label>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bouton Appliquer */}
        <button
          type="button"
          disabled={solved.items.length === 0}
          onClick={handleApplyToJournal}
          className="w-full py-3 rounded-xl bg-gradient-to-b from-blue-400 to-blue-600 hover:from-blue-300 hover:to-blue-500 text-white font-semibold text-sm shadow-[0_6px_18px_-4px_rgba(59,130,246,0.5),inset_0_1px_0_rgba(255,255,255,0.25)] disabled:opacity-40 transition active:scale-[0.98]"
        >
          Appliquer au journal ({solved.items.length} aliment{solved.items.length > 1 ? "s" : ""})
        </button>
      </div>
    </div>
  );
}
