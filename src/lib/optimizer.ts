import { round1, scaleNutrients, sumNutrients } from "./calculations";
import type { MealSlot, NutrientValues } from "./types";

export interface OptimizerItem {
  id: string;
  name: string;
  mealSlot: MealSlot;
  per100g: NutrientValues;
  unitType?: "grams" | "unit";
  unitWeightG?: number;
  unitLabel?: string;
  minG: number;
  maxG: number;
  locked: boolean;
  quantityG: number;
}

export interface MacroTarget {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface OptimizerResult {
  items: OptimizerItem[];
  totals: NutrientValues;
  deltas: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  matchPct: number;
}

/**
 * Calcule l'erreur pondérée selon la priorité demandée :
 * 1. Calories (poids 1.0)
 * 2. Protéines (poids 0.75)
 * 3. Lipides (poids 0.50)
 * 4. Glucides (poids 0.30)
 */
function weightedLoss(achieved: NutrientValues, target: MacroTarget): number {
  const kcalScale = Math.max(200, target.kcal);
  const pScale = Math.max(20, target.proteinG);
  const fScale = Math.max(15, target.fatG);
  const cScale = Math.max(30, target.carbsG);

  const eKcal = (achieved.kcal - target.kcal) / kcalScale;
  const eP = (achieved.proteinG - target.proteinG) / pScale;
  const eF = (achieved.fatG - target.fatG) / fScale;
  const eC = (achieved.carbsG - target.carbsG) / cScale;

  return 1.0 * eKcal * eKcal + 0.75 * eP * eP + 0.5 * eF * eF + 0.3 * eC * eC;
}

function getStepSize(item: OptimizerItem): number {
  if (item.unitType === "unit" && item.unitWeightG && item.unitWeightG > 0) {
    return item.unitWeightG * 0.5; // pas de 0.5 unité
  }
  return 5; // pas de 5 g
}

function clampAndRound(val: number, minG: number, maxG: number, step: number): number {
  const clamped = Math.max(minG, Math.min(maxG, val));
  const snapped = Math.round(clamped / step) * step;
  return Math.max(minG, Math.min(maxG, Math.round(snapped * 10) / 10));
}

export function optimizeMealQuantities(
  rawItems: OptimizerItem[],
  target: MacroTarget
): OptimizerResult {
  if (rawItems.length === 0) {
    const empty: NutrientValues = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, micronutrients: {} };
    return {
      items: [],
      totals: empty,
      deltas: {
        kcal: -Math.round(target.kcal),
        proteinG: round1(-target.proteinG),
        carbsG: round1(-target.carbsG),
        fatG: round1(-target.fatG),
      },
      matchPct: 0,
    };
  }

  const safeTarget: MacroTarget = {
    kcal: Math.max(0, target.kcal),
    proteinG: Math.max(0, target.proteinG),
    carbsG: Math.max(0, target.carbsG),
    fatG: Math.max(0, target.fatG),
  };

  // Initialisation au milieu des bornes pour les éléments non verrouillés
  const working: OptimizerItem[] = rawItems.map((item) => {
    const step = getStepSize(item);
    if (item.locked) {
      return { ...item };
    }
    const initQty = clampAndRound((item.minG + item.maxG) / 2, item.minG, item.maxG, step);
    return { ...item, quantityG: initQty };
  });

  const unlockedIndices = working
    .map((it, idx) => (!it.locked ? idx : -1))
    .filter((idx) => idx >= 0);

  if (unlockedIndices.length > 0) {
    const currentTotals = () =>
      sumNutrients(working.map((it) => scaleNutrients(it.per100g, it.quantityG)));

    // Descente de coordonnées discrète sur les pas réalistes (5g ou 0.5 unité)
    for (let iter = 0; iter < 35; iter++) {
      let improved = false;
      for (const idx of unlockedIndices) {
        const item = working[idx];
        const step = getStepSize(item);

        let bestQty = item.quantityG;
        let bestLoss = weightedLoss(currentTotals(), safeTarget);

        // Tester tous les candidats sur une grille coarse + fine autour du courant
        const candidates = new Set<number>();
        for (let g = item.minG; g <= item.maxG; g += step) {
          candidates.add(clampAndRound(g, item.minG, item.maxG, step));
        }
        candidates.add(clampAndRound(item.minG, item.minG, item.maxG, step));
        candidates.add(clampAndRound(item.maxG, item.minG, item.maxG, step));

        for (const cand of candidates) {
          working[idx] = { ...item, quantityG: cand };
          const loss = weightedLoss(currentTotals(), safeTarget);
          if (loss < bestLoss - 1e-7) {
            bestLoss = loss;
            bestQty = cand;
            improved = true;
          }
        }
        working[idx] = { ...item, quantityG: bestQty };
      }
      if (!improved) break;
    }
  }

  const totals = sumNutrients(working.map((it) => scaleNutrients(it.per100g, it.quantityG)));
  const deltas = {
    kcal: Math.round(totals.kcal - safeTarget.kcal),
    proteinG: round1(totals.proteinG - safeTarget.proteinG),
    carbsG: round1(totals.carbsG - safeTarget.carbsG),
    fatG: round1(totals.fatG - safeTarget.fatG),
  };

  const relErr =
    safeTarget.kcal > 0 ? Math.abs(totals.kcal - safeTarget.kcal) / safeTarget.kcal : 0;
  const matchPct = Math.max(0, Math.min(100, Math.round((1 - relErr) * 100)));

  return {
    items: working,
    totals,
    deltas,
    matchPct,
  };
}
