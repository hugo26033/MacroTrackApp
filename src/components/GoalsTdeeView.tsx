"use client";

import React from "react";
import { calculateTdee } from "@/lib/calculations";
import {
  ActivityLevel,
  FoodLogEntry,
  MICRONUTRIENT_CATALOG,
  MicronutrientKey,
  NutritionGoals,
  UserProfile,
  WeightEntry,
} from "@/lib/types";

interface GoalsTdeeViewProps {
  profile: UserProfile;
  goals: NutritionGoals;
  weights: WeightEntry[];
  foodLogs: FoodLogEntry[];
  onUpdateProfile: (patch: Partial<UserProfile>) => void;
  onUpdateGoals: (patch: Partial<NutritionGoals>) => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  onResetDemo: () => void;
  onClearAllData: () => void;
}

const ACTIVITY_LABELS: { value: ActivityLevel; label: string }[] = [
  { value: "sedentary", label: "Sédentaire (×1.2)" },
  { value: "light", label: "Léger 1–3x/sem (×1.375)" },
  { value: "moderate", label: "Modéré 3–5x/sem (×1.55)" },
  { value: "active", label: "Actif 6–7x/sem (×1.725)" },
  { value: "very_active", label: "Très actif / physique (×1.9)" },
];

export function GoalsTdeeView({
  profile,
  goals,
  weights,
  foodLogs,
  onUpdateProfile,
  onUpdateGoals,
  onExportJSON,
  onExportCSV,
  onResetDemo,
  onClearAllData,
}: GoalsTdeeViewProps) {
  const latestWeight = weights.length > 0 ? weights[weights.length - 1].weightKg : 75;
  const tdee = calculateTdee({
    profile,
    weightKg: latestWeight,
    foodLogs,
    weights,
  });

  const activeTdee =
    profile.adaptiveTdeeEnabled && tdee.tdeeAdaptive ? tdee.tdeeAdaptive : tdee.tdeeTheoretical;

  function applyGoalPreset(type: "cut" | "maintain" | "bulk") {
    const offset = type === "cut" ? -400 : type === "bulk" ? 250 : 0;
    const targetKcal = Math.max(1200, activeTdee + offset);
    const proteinG = Math.round(latestWeight * 2.1);
    const fatG = Math.round((targetKcal * 0.28) / 9);
    const carbsG = Math.max(50, Math.round((targetKcal - proteinG * 4 - fatG * 9) / 4));
    onUpdateGoals({
      goalType: type,
      targetKcal,
      proteinG,
      fatG,
      carbsG,
    });
  }

  function togglePinnedMicro(key: MicronutrientKey) {
    const exists = profile.pinnedMicronutrients.includes(key);
    const next = exists
      ? profile.pinnedMicronutrients.filter((k) => k !== key)
      : [...profile.pinnedMicronutrients, key];
    onUpdateProfile({ pinnedMicronutrients: next });
  }

  function updateMicroTarget(key: MicronutrientKey, val: number) {
    onUpdateGoals({
      micronutrientTargets: {
        ...goals.micronutrientTargets,
        [key]: val,
      },
    });
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">Objectifs, TDEE & Réglages</h2>

      {/* Calculateur TDEE + TDEE Adaptatif */}
      <section className="rounded-3xl bg-zinc-900/80 border border-zinc-800 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-sm sm:text-base">Calculateur TDEE & Adaptatif</h3>
          <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={profile.adaptiveTdeeEnabled}
              onChange={(e) => onUpdateProfile({ adaptiveTdeeEnabled: e.target.checked })}
              className="accent-emerald-500"
            />
            Utiliser le TDEE adaptatif
          </label>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="space-y-1 text-xs">
            <span className="text-zinc-400">Sexe</span>
            <select
              value={profile.sex}
              onChange={(e) => onUpdateProfile({ sex: e.target.value as "male" | "female" })}
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-2.5 py-2"
            >
              <option value="male">Homme</option>
              <option value="female">Femme</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-zinc-400">Âge</span>
            <input
              type="number"
              value={profile.age}
              onChange={(e) => onUpdateProfile({ age: Number(e.target.value) })}
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-2.5 py-2 font-mono"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-zinc-400">Taille (cm)</span>
            <input
              type="number"
              value={profile.heightCm}
              onChange={(e) => onUpdateProfile({ heightCm: Number(e.target.value) })}
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-2.5 py-2 font-mono"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-zinc-400">% Masse grasse (opt.)</span>
            <input
              type="number"
              step="0.5"
              value={profile.bodyFatPct ?? ""}
              onChange={(e) =>
                onUpdateProfile({
                  bodyFatPct: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-2.5 py-2 font-mono"
            />
          </label>
        </div>

        <label className="block space-y-1 text-xs">
          <span className="text-zinc-400">Niveau d&apos;activité</span>
          <select
            value={profile.activityLevel}
            onChange={(e) => onUpdateProfile({ activityLevel: e.target.value as ActivityLevel })}
            className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2"
          >
            {ACTIVITY_LABELS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-3.5">
            <p className="text-xs text-zinc-400">BMR (Mifflin / Katch)</p>
            <p className="text-lg font-bold font-mono mt-0.5">
              {tdee.bmrMifflin} kcal
              {tdee.bmrKatch ? (
                <span className="text-xs text-zinc-400 font-normal"> / {tdee.bmrKatch}</span>
              ) : null}
            </p>
          </div>
          <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-3.5">
            <p className="text-xs text-zinc-400">TDEE théorique</p>
            <p className="text-lg font-bold font-mono text-sky-400 mt-0.5">
              {tdee.tdeeTheoretical} kcal
            </p>
          </div>
          <div className="rounded-2xl bg-zinc-950 border border-emerald-500/30 p-3.5">
            <p className="text-xs text-zinc-400">
              TDEE adaptatif ({tdee.adaptiveConfidence})
            </p>
            <p className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
              {tdee.tdeeAdaptive ? `${tdee.tdeeAdaptive} kcal` : "Données insuffisantes"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => applyGoalPreset("cut")}
            className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/25"
          >
            Appliquer Sèche (-400 kcal)
          </button>
          <button
            type="button"
            onClick={() => applyGoalPreset("maintain")}
            className="px-3.5 py-2 rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-300 text-xs font-semibold hover:bg-sky-500/25"
          >
            Appliquer Maintenance
          </button>
          <button
            type="button"
            onClick={() => applyGoalPreset("bulk")}
            className="px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-semibold hover:bg-amber-500/25"
          >
            Appliquer Prise de masse (+250 kcal)
          </button>
        </div>
      </section>

      {/* Objectifs précis Kcal, Macros, Pas, Eau */}
      <section className="rounded-3xl bg-zinc-900/80 border border-zinc-800 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-sm sm:text-base">Objectifs quotidiens précis</h3>
          {(() => {
            const pKcal = Math.round(goals.proteinG * 4);
            const cKcal = Math.round(goals.carbsG * 4);
            const fKcal = Math.round(goals.fatG * 9);
            const macroTotal = pKcal + cKcal + fKcal;
            if (macroTotal === goals.targetKcal) return null;
            return (
              <button
                type="button"
                onClick={() => onUpdateGoals({ targetKcal: macroTotal })}
                className="px-3 py-1 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-medium hover:bg-blue-500/25"
              >
                Aligner kcal sur macros ({macroTotal.toLocaleString("fr-FR")} kcal)
              </button>
            );
          })()}
        </div>

        {/* Jauge kcal remplie par les macros (4 / 4 / 9) */}
        {(() => {
          const pKcal = Math.round(goals.proteinG * 4);
          const cKcal = Math.round(goals.carbsG * 4);
          const fKcal = Math.round(goals.fatG * 9);
          const macroTotal = pKcal + cKcal + fKcal;
          const denom = Math.max(1, goals.targetKcal);
          const cPct = Math.min(100, (cKcal / denom) * 100);
          const fPct = Math.min(Math.max(0, 100 - cPct), (fKcal / denom) * 100);
          const pPct = Math.min(Math.max(0, 100 - cPct - fPct), (pKcal / denom) * 100);
          const diff = goals.targetKcal - macroTotal;

          return (
            <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-3.5 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <span className="text-zinc-400">
                  Remplissage par les macros :{" "}
                  <strong className="font-mono text-zinc-100">
                    {macroTotal.toLocaleString("fr-FR")}
                  </strong>{" "}
                  / {goals.targetKcal.toLocaleString("fr-FR")} kcal
                </span>
                <span
                  className={`font-mono font-semibold ${
                    diff === 0
                      ? "text-emerald-400"
                      : diff > 0
                        ? "text-sky-400"
                        : "text-rose-400"
                  }`}
                >
                  {diff === 0
                    ? "100% équilibré"
                    : diff > 0
                      ? `Reste ${diff.toLocaleString("fr-FR")} kcal`
                      : `+${Math.abs(diff).toLocaleString("fr-FR")} kcal au-dessus`}
                </span>
              </div>

              <div className="h-2.5 rounded-full bg-zinc-900 overflow-hidden flex">
                <div className="h-full bg-teal-400 transition-all" style={{ width: `${cPct}%` }} />
                <div className="h-full bg-purple-400 transition-all" style={{ width: `${fPct}%` }} />
                <div className="h-full bg-amber-400 transition-all" style={{ width: `${pPct}%` }} />
              </div>

              <div className="flex flex-wrap gap-3 text-[11px] text-zinc-400">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-teal-400" /> Glucides {cKcal} kcal
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-purple-400" /> Lipides {fKcal} kcal
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400" /> Protéines {pKcal} kcal
                </span>
              </div>
            </div>
          );
        })()}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <label className="space-y-1">
            <span className="text-zinc-400">Calories cibles (kcal)</span>
            <input
              type="number"
              value={goals.targetKcal}
              onChange={(e) => onUpdateGoals({ targetKcal: Number(e.target.value) })}
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono text-emerald-400 font-semibold"
            />
          </label>
          <label className="space-y-1">
            <span className="text-zinc-400">Protéines (g)</span>
            <input
              type="number"
              value={goals.proteinG}
              onChange={(e) => onUpdateGoals({ proteinG: Number(e.target.value) })}
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono"
            />
          </label>
          <label className="space-y-1">
            <span className="text-zinc-400">Glucides (g)</span>
            <input
              type="number"
              value={goals.carbsG}
              onChange={(e) => onUpdateGoals({ carbsG: Number(e.target.value) })}
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono"
            />
          </label>
          <label className="space-y-1">
            <span className="text-zinc-400">Lipides (g)</span>
            <input
              type="number"
              value={goals.fatG}
              onChange={(e) => onUpdateGoals({ fatG: Number(e.target.value) })}
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono"
            />
          </label>
          <label className="space-y-1">
            <span className="text-zinc-400">Objectif Pas</span>
            <input
              type="number"
              step="500"
              value={goals.targetSteps}
              onChange={(e) => onUpdateGoals({ targetSteps: Number(e.target.value) })}
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono"
            />
          </label>
          <label className="space-y-1">
            <span className="text-zinc-400">Hydratation (ml)</span>
            <input
              type="number"
              step="100"
              value={goals.targetWaterMl}
              onChange={(e) => onUpdateGoals({ targetWaterMl: Number(e.target.value) })}
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono"
            />
          </label>
        </div>

        <label className="block space-y-1 text-xs max-w-xs">
          <span className="text-zinc-400">Seuil de maintenance poids (kg / semaine)</span>
          <input
            type="number"
            step="0.05"
            value={profile.weightTrendThresholdKgWeek}
            onChange={(e) =>
              onUpdateProfile({ weightTrendThresholdKgWeek: Number(e.target.value) })
            }
            className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 font-mono"
          />
        </label>
      </section>

      {/* Micronutriments épinglés */}
      <section className="rounded-3xl bg-zinc-900/80 border border-zinc-800 p-5 space-y-3">
        <h3 className="font-semibold text-sm sm:text-base">Micronutriments épinglés & cibles</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {MICRONUTRIENT_CATALOG.map((meta) => {
            const pinned = profile.pinnedMicronutrients.includes(meta.key);
            const target = goals.micronutrientTargets[meta.key] ?? meta.defaultTarget;
            return (
              <div
                key={meta.key}
                className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800 text-xs"
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pinned}
                    onChange={() => togglePinnedMicro(meta.key)}
                    className="accent-emerald-500"
                  />
                  <span>{meta.label}</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={target}
                    onChange={(e) => updateMicroTarget(meta.key, Number(e.target.value))}
                    className="w-20 rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1 text-right font-mono"
                  />
                  <span className="text-zinc-500 w-7">{meta.unit}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Export & Données */}
      <section className="rounded-3xl bg-zinc-900/80 border border-zinc-800 p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="font-semibold text-sm">Sauvegarde & Export</h3>
          <p className="text-xs text-zinc-400">
            Tes données restent accessibles hors-ligne et exportables à tout moment.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onExportJSON}
            className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={onExportCSV}
            className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium"
          >
            Export CSV repas
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Effacer tous les repas, pesées, pas et données de test pour repartir à zéro ?")) {
                onClearAllData();
              }
            }}
            className="px-3.5 py-2 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-semibold hover:bg-rose-500/30"
          >
            Effacer toutes les données
          </button>
          <button
            type="button"
            onClick={onResetDemo}
            className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
          >
            Charger démo
          </button>
        </div>
      </section>
    </div>
  );
}
