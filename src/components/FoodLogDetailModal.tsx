"use client";

import React, { useEffect, useState } from "react";
import { round1, scaleNutrients, sumNutrients } from "@/lib/calculations";
import {
  FoodLogEntry,
  MICRONUTRIENT_CATALOG,
  MealSlot,
  NutrientValues,
  Recipe,
  RecipeItem,
} from "@/lib/types";
import { TrashIcon, XIcon } from "./Icons";
import { NumberInput } from "./NumberInput";

interface FoodLogDetailModalProps {
  entry: FoodLogEntry | null;
  recipes?: Recipe[];
  onClose: () => void;
  onSave: (updated: FoodLogEntry) => void;
  onDelete: (id: string) => void;
}

const MEAL_SLOTS: { value: MealSlot; label: string }[] = [
  { value: "breakfast", label: "Petit déjeuner" },
  { value: "lunch", label: "Déjeuner" },
  { value: "dinner", label: "Dîner" },
  { value: "snack", label: "Collation" },
];

export function FoodLogDetailModal({
  entry,
  recipes = [],
  onClose,
  onSave,
  onDelete,
}: FoodLogDetailModalProps) {
  const [foodName, setFoodName] = useState<string>("");
  const [quantityG, setQuantityG] = useState<number>(100);
  const [mealSlot, setMealSlot] = useState<MealSlot>("lunch");
  const [timeHHMM, setTimeHHMM] = useState<string>("12:00");
  const [nutrients, setNutrients] = useState<NutrientValues>({
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    micronutrients: {},
  });
  const [per100gBase, setPer100gBase] = useState<NutrientValues | null>(null);
  const [recipeItems, setRecipeItems] = useState<RecipeItem[] | undefined>(undefined);

  useEffect(() => {
    if (!entry) return;
    const baseQty = Math.max(1, entry.quantityG || 100);
    const factor = 100 / baseQty;
    const microsPer100: NutrientValues["micronutrients"] = {};
    for (const [k, v] of Object.entries(entry.nutrients.micronutrients ?? {})) {
      if (typeof v === "number") {
        microsPer100[k as keyof typeof microsPer100] = Math.round(v * factor * 100) / 100;
      }
    }
    setPer100gBase({
      kcal: entry.nutrients.kcal * factor,
      proteinG: entry.nutrients.proteinG * factor,
      carbsG: entry.nutrients.carbsG * factor,
      fatG: entry.nutrients.fatG * factor,
      micronutrients: microsPer100,
    });
    setFoodName(entry.foodName);
    setQuantityG(entry.quantityG);
    setMealSlot(entry.mealSlot);
    setTimeHHMM(entry.loggedAt.slice(11, 16) || "12:00");
    setNutrients(entry.nutrients);
    if (entry.recipeItems && entry.recipeItems.length > 0) {
      setRecipeItems(entry.recipeItems.map((i) => ({ ...i })));
    } else if (entry.source === "recipe" && recipes.length > 0) {
      const cleanName = entry.foodName.replace(/\s*\(1 portion\)\s*$/i, "").trim().toLowerCase();
      const matched = recipes.find((r) => r.name.trim().toLowerCase() === cleanName);
      if (matched && matched.items.length > 0) {
        const totalRecipeG = Math.max(
          1,
          matched.items.reduce((s, i) => s + i.quantityG, 0)
        );
        const ratio = (entry.quantityG || totalRecipeG) / totalRecipeG;
        setRecipeItems(
          matched.items.map((i) => ({
            ...i,
            quantityG: round1(i.quantityG * ratio),
          }))
        );
      } else {
        setRecipeItems(undefined);
      }
    } else {
      setRecipeItems(undefined);
    }
  }, [entry, recipes]);

  if (!entry) return null;

  function applyQuantity(newQty: number) {
    const safeQty = Math.max(1, Math.round(newQty * 10) / 10);
    if (recipeItems && recipeItems.length > 0 && quantityG > 0) {
      const ratio = safeQty / quantityG;
      const scaledItems = recipeItems.map((item) => ({
        ...item,
        quantityG: round1(item.quantityG * ratio),
      }));
      setRecipeItems(scaledItems);
      setQuantityG(safeQty);
      setNutrients(sumNutrients(scaledItems.map((i) => scaleNutrients(i.per100g, i.quantityG))));
      return;
    }
    setQuantityG(safeQty);
    if (per100gBase) {
      setNutrients(scaleNutrients(per100gBase, safeQty));
    }
  }

  function updateRecipeIngredient(idx: number, patch: Partial<RecipeItem>) {
    if (!recipeItems) return;
    const nextItems = recipeItems.map((item, i) => (i === idx ? { ...item, ...patch } : item));
    const totalG = Math.max(1, round1(nextItems.reduce((s, i) => s + i.quantityG, 0)));
    const nextNutrients = sumNutrients(
      nextItems.map((i) => scaleNutrients(i.per100g, i.quantityG))
    );
    setRecipeItems(nextItems);
    setQuantityG(totalG);
    setNutrients(nextNutrients);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!entry) return;
    const updatedLoggedAt = `${entry.logDate}T${timeHHMM}:00`;
    onSave({
      ...entry,
      foodName: foodName.trim() || entry.foodName,
      quantityG,
      ...(recipeItems ? { recipeItems } : {}),
      mealSlot,
      loggedAt: updatedLoggedAt,
      nutrients,
    });
    onClose();
  }

  const microEntries = MICRONUTRIENT_CATALOG.map((meta) => ({
    meta,
    value: nutrients.micronutrients?.[meta.key] ?? 0,
  }));

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
    >
      <form
        onSubmit={handleSave}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-gradient-to-b from-[#1a2030] to-[#121622] border border-white/[0.08] text-zinc-100 shadow-2xl p-5 space-y-5"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <input
              type="text"
              value={foodName}
              onChange={(e) => setFoodName(e.target.value)}
              className="w-full bg-transparent text-lg font-bold leading-snug border-b border-white/10 focus:border-blue-500 focus:outline-none pb-0.5"
              aria-label="Nom de l'aliment"
            />
            {entry.brand && <p className="text-xs text-zinc-400 mt-1">{entry.brand}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-300 shrink-0"
            aria-label="Fermer"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Quantité + Raccourcis */}
        <div className="rounded-2xl bg-[#0f131d] border border-white/[0.06] p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs font-medium text-zinc-400">Quantité (grammes / ml)</label>
            <div className="flex items-center gap-2">
              <NumberInput
                min={1}
                step="1"
                value={quantityG}
                onValueChange={applyQuantity}
                className="w-24 rounded-xl bg-[#181d2a] border border-white/10 px-3 py-1.5 text-right font-mono text-base font-bold text-blue-400 focus:outline-none focus:border-blue-500"
              />
              <span className="text-xs text-zinc-400">g</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "-50g", val: quantityG - 50 },
              { label: "-10g", val: quantityG - 10 },
              { label: "+10g", val: quantityG + 10 },
              { label: "+50g", val: quantityG + 50 },
              { label: "×0.5", val: round1(quantityG * 0.5) },
              { label: "×1.5", val: round1(quantityG * 1.5) },
              { label: "×2", val: round1(quantityG * 2) },
            ].map((btn) => (
              <button
                key={btn.label}
                type="button"
                onClick={() => applyQuantity(btn.val)}
                className="px-2.5 py-1 rounded-lg bg-[#181d2a] hover:bg-[#232a3d] border border-white/[0.06] text-[11px] font-mono text-zinc-300 transition active:scale-95"
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Ingrédients ajustables si recette */}
        {recipeItems && recipeItems.length > 0 && (
          <div className="rounded-2xl bg-[#0f131d] border border-white/[0.06] p-4 space-y-2.5">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Ingrédients de la recette
            </p>
            <div className="space-y-2">
              {recipeItems.map((ing, idx) => {
                const isUnit = ing.unitType === "unit";
                const unitWeight = ing.unitWeightG || 100;
                const unitCount = Math.round((ing.quantityG / unitWeight) * 100) / 100;
                return (
                  <div
                    key={`${ing.foodName}-${idx}`}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#181d2a] border border-white/[0.05] text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="truncate block text-zinc-200">{ing.foodName}</span>
                      {isUnit && (
                        <span className="text-[10px] text-zinc-500">
                          1 {ing.unitLabel || "u"} = {unitWeight} g ({ing.quantityG} g)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          updateRecipeIngredient(idx, {
                            unitType: isUnit ? "grams" : "unit",
                            unitWeightG: ing.unitWeightG || 100,
                          })
                        }
                        className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-medium text-blue-400"
                        title="Basculer grammes / unité"
                      >
                        {isUnit ? ing.unitLabel || "unité" : "g"}
                      </button>
                      {isUnit ? (
                        <NumberInput
                          min={0}
                          step="0.5"
                          fallback={0}
                          value={unitCount}
                          onValueChange={(cnt) =>
                            updateRecipeIngredient(idx, {
                              quantityG: Math.round(cnt * unitWeight * 10) / 10,
                            })
                          }
                          className="w-20 rounded-lg bg-[#0f131d] border border-white/10 px-2 py-1 text-right font-mono text-zinc-100"
                        />
                      ) : (
                        <NumberInput
                          min={0}
                          value={ing.quantityG}
                          onValueChange={(qty) => updateRecipeIngredient(idx, { quantityG: qty })}
                          className="w-20 rounded-lg bg-[#0f131d] border border-white/10 px-2 py-1 text-right font-mono text-zinc-100"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Résumé Calories & Macros */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="rounded-2xl bg-[#0f131d] border border-white/[0.06] p-2.5">
            <div className="text-[11px] text-zinc-400">Calories</div>
            <div className="text-base font-bold font-mono text-blue-400 mt-0.5">
              {nutrients.kcal}
            </div>
          </div>
          <div className="rounded-2xl bg-[#0f131d] border border-white/[0.06] p-2.5">
            <div className="text-[11px] text-zinc-400">Glucides</div>
            <div className="text-base font-bold font-mono text-teal-400 mt-0.5">
              {nutrients.carbsG}g
            </div>
          </div>
          <div className="rounded-2xl bg-[#0f131d] border border-white/[0.06] p-2.5">
            <div className="text-[11px] text-zinc-400">Lipides</div>
            <div className="text-base font-bold font-mono text-purple-400 mt-0.5">
              {nutrients.fatG}g
            </div>
          </div>
          <div className="rounded-2xl bg-[#0f131d] border border-white/[0.06] p-2.5">
            <div className="text-[11px] text-zinc-400">Protéines</div>
            <div className="text-base font-bold font-mono text-amber-400 mt-0.5">
              {nutrients.proteinG}g
            </div>
          </div>
        </div>

        {/* Repas & Heure (pour le jeûne auto) */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <label className="space-y-1">
            <span className="text-zinc-400">Repas</span>
            <select
              value={mealSlot}
              onChange={(e) => setMealSlot(e.target.value as MealSlot)}
              className="w-full rounded-xl bg-[#0f131d] border border-white/10 px-3 py-2 text-zinc-100"
            >
              {MEAL_SLOTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-zinc-400">Heure (jeûne auto)</span>
            <input
              type="time"
              value={timeHHMM}
              onChange={(e) => setTimeHHMM(e.target.value)}
              className="w-full rounded-xl bg-[#0f131d] border border-white/10 px-3 py-2 font-mono text-zinc-100"
            />
          </label>
        </div>

        {/* Détail Nutriments & Micronutriments */}
        <div className="rounded-2xl bg-[#0f131d] border border-white/[0.06] p-4 space-y-2.5">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Détail nutriments & micronutriments
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {microEntries.map(({ meta, value }) => (
              <div
                key={meta.key}
                className="flex items-center justify-between py-1 border-b border-white/[0.04]"
              >
                <span className="text-zinc-400">{meta.label}</span>
                <span className="font-mono text-zinc-200">
                  {value} {meta.unit}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => {
              onDelete(entry.id);
              onClose();
            }}
            className="px-4 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold hover:bg-rose-500/25 inline-flex items-center gap-1.5"
          >
            <TrashIcon className="w-4 h-4" />
            Supprimer
          </button>
          <button
            type="submit"
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-b from-blue-400 to-blue-600 hover:from-blue-300 hover:to-blue-500 text-white text-sm font-semibold shadow-[0_6px_18px_-4px_rgba(59,130,246,0.5),inset_0_1px_0_rgba(255,255,255,0.25)] transition active:scale-[0.98]"
          >
            Enregistrer les modifications
          </button>
        </div>
      </form>
    </div>
  );
}
