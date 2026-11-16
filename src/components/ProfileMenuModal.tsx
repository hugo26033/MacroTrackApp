"use client";

import React from "react";
import type { WeightEntry } from "@/lib/types";
import {
  ChartIcon,
  ChevronRightIcon,
  FootprintsIcon,
  MoonIcon,
  ScaleIcon,
  SearchIcon,
  SunIcon,
  TrashIcon,
  XIcon,
} from "./Icons";

interface ProfileMenuModalProps {
  open: boolean;
  onClose: () => void;
  displayName: string;
  streakCount: number;
  weights: WeightEntry[];
  isDark: boolean;
  onToggleTheme: () => void;
  onNavigate: (tab: "goals" | "analytics") => void;
  onOpenFoods: () => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  onClearAllData: () => void;
}

export function ProfileMenuModal({
  open,
  onClose,
  displayName,
  streakCount,
  weights,
  isDark,
  onToggleTheme,
  onNavigate,
  onOpenFoods,
  onExportJSON,
  onExportCSV,
  onClearAllData,
}: ProfileMenuModalProps) {
  if (!open) return null;

  const sortedWeights = [...weights].sort((a, b) => a.logDate.localeCompare(b.logDate));
  const weightDiff =
    sortedWeights.length >= 2
      ? Math.round((sortedWeights[0].weightKg - sortedWeights[sortedWeights.length - 1].weightKg) * 10) / 10
      : 0;

  const weightLabel =
    sortedWeights.length < 2
      ? "—"
      : weightDiff >= 0
        ? `${weightDiff.toFixed(1)} kg`
        : `+${Math.abs(weightDiff).toFixed(1)} kg`;

  const weightSublabel =
    sortedWeights.length < 2
      ? "aucune pesée"
      : weightDiff >= 0
        ? "kg perdus"
        : "kg pris";

  const initial = (displayName || "U").trim().charAt(0).toUpperCase();

  return (
    <div
      className={`fixed inset-0 z-50 overflow-y-auto ${
        isDark ? "bg-[#0f131d] text-zinc-100" : "bg-zinc-100 text-zinc-900"
      }`}
    >
      <div className="max-w-xl mx-auto px-4 pt-4 pb-12 space-y-5">
        {/* Top bar with X */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className={`w-10 h-10 rounded-full flex items-center justify-center border transition ${
              isDark
                ? "bg-[#1e2433] border-white/10 text-zinc-200 hover:bg-[#262d3f]"
                : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50"
            }`}
            aria-label="Fermer le menu profil"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Carte Profil + Stats */}
        <button
          type="button"
          onClick={() => {
            onNavigate("goals");
            onClose();
          }}
          className={`w-full rounded-2xl border p-4 flex items-center justify-between gap-3 text-left transition ${
            isDark
              ? "bg-[#181c28] border-white/[0.06] hover:bg-[#1d2230]"
              : "bg-white border-zinc-200 hover:bg-zinc-50"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
              {initial}
            </div>
            <span className="font-semibold text-sm truncate">{displayName || "Profil"}</span>
          </div>

          <div className="flex items-center gap-5 shrink-0">
            <div className="text-center">
              <div className="text-sm font-bold font-mono">{streakCount}</div>
              <div className="text-[11px] text-zinc-400">D&apos;affilée</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold font-mono">{weightLabel}</div>
              <div className="text-[11px] text-zinc-400">{weightSublabel}</div>
            </div>
            <ChevronRightIcon className="w-4 h-4 text-zinc-500" />
          </div>
        </button>

        {/* Groupe 2 : Objectifs, Poids, Aliments */}
        <div
          className={`rounded-2xl border divide-y ${
            isDark
              ? "bg-[#181c28] border-white/[0.06] divide-white/[0.06]"
              : "bg-white border-zinc-200 divide-zinc-100"
          }`}
        >
          <button
            type="button"
            onClick={() => {
              onNavigate("goals");
              onClose();
            }}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02]"
          >
            <div className="flex items-center gap-3">
              <ChartIcon className="w-5 h-5 text-zinc-400" />
              <span className="text-sm font-medium">Objectifs & Calculateur TDEE</span>
            </div>
            <ChevronRightIcon className="w-4 h-4 text-zinc-500" />
          </button>

          <button
            type="button"
            onClick={() => {
              onNavigate("analytics");
              onClose();
            }}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02]"
          >
            <div className="flex items-center gap-3">
              <ScaleIcon className="w-5 h-5 text-zinc-400" />
              <span className="text-sm font-medium">Poids et tendances (3j / 5j)</span>
            </div>
            <ChevronRightIcon className="w-4 h-4 text-zinc-500" />
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenFoods();
              onClose();
            }}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02]"
          >
            <div className="flex items-center gap-3">
              <SearchIcon className="w-5 h-5 text-zinc-400" />
              <span className="text-sm font-medium">Repas, recettes et aliments</span>
            </div>
            <ChevronRightIcon className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        {/* Groupe 3 : Pas & Imports */}
        <div
          className={`rounded-2xl border divide-y ${
            isDark
              ? "bg-[#181c28] border-white/[0.06] divide-white/[0.06]"
              : "bg-white border-zinc-200 divide-zinc-100"
          }`}
        >
          <button
            type="button"
            onClick={() => {
              onNavigate("analytics");
              onClose();
            }}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02]"
          >
            <div className="flex items-center gap-3">
              <FootprintsIcon className="w-5 h-5 text-zinc-400" />
              <span className="text-sm font-medium">Pas & Import CSV / JSON</span>
            </div>
            <ChevronRightIcon className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        {/* Groupe 4 : Paramètres, Thème & Données */}
        <div
          className={`rounded-2xl border divide-y ${
            isDark
              ? "bg-[#181c28] border-white/[0.06] divide-white/[0.06]"
              : "bg-white border-zinc-200 divide-zinc-100"
          }`}
        >
          <button
            type="button"
            onClick={onToggleTheme}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02]"
          >
            <div className="flex items-center gap-3">
              {isDark ? (
                <MoonIcon className="w-5 h-5 text-zinc-400" />
              ) : (
                <SunIcon className="w-5 h-5 text-zinc-400" />
              )}
              <span className="text-sm font-medium">
                Thème ({isDark ? "Sombre" : "Clair"})
              </span>
            </div>
            <ChevronRightIcon className="w-4 h-4 text-zinc-500" />
          </button>

          <button
            type="button"
            onClick={onExportJSON}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02]"
          >
            <span className="text-sm font-medium">Exporter toutes les données (JSON)</span>
            <ChevronRightIcon className="w-4 h-4 text-zinc-500" />
          </button>

          <button
            type="button"
            onClick={onExportCSV}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02]"
          >
            <span className="text-sm font-medium">Exporter le journal repas (CSV)</span>
            <ChevronRightIcon className="w-4 h-4 text-zinc-500" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "Effacer tous les repas, pesées, pas et données de test pour repartir à zéro ?"
                )
              ) {
                onClearAllData();
                onClose();
              }
            }}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left text-rose-400 hover:bg-rose-500/5"
          >
            <div className="flex items-center gap-3">
              <TrashIcon className="w-4 h-4" />
              <span className="text-sm font-medium">Effacer toutes les données</span>
            </div>
            <ChevronRightIcon className="w-4 h-4 text-rose-400/70" />
          </button>
        </div>
      </div>
    </div>
  );
}
