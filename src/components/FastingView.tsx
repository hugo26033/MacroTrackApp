"use client";

import React from "react";
import { computeAutomaticFasting } from "@/lib/calculations";
import type { FoodLogEntry } from "@/lib/types";
import { ClockIcon } from "./Icons";

interface FastingViewProps {
  foodLogs: FoodLogEntry[];
  fastingTargetHours: number;
  onChangeTargetHours: (hours: number) => void;
}

const PROTOCOLS = [
  { label: "14:10", hours: 14 },
  { label: "16:8", hours: 16 },
  { label: "18:6", hours: 18 },
  { label: "20:4", hours: 20 },
  { label: "OMAD (23h)", hours: 23 },
];

export function FastingView({
  foodLogs,
  fastingTargetHours,
  onChangeTargetHours,
}: FastingViewProps) {
  const status = computeAutomaticFasting(foodLogs, fastingTargetHours);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Jeûne intermittent automatique</h2>
          <p className="text-xs text-zinc-400">
            Calculé automatiquement à partir de l&apos;heure du premier et du dernier repas loggés.
          </p>
        </div>
      </div>

      {/* Carte Statut en direct */}
      <section className="rounded-3xl bg-zinc-900/80 border border-zinc-800 p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ClockIcon className="w-7 h-7" />
            </div>
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wider">
                {status.isCurrentlyFasting ? "En jeûne depuis le dernier repas" : "Fenêtre alimentaire"}
              </p>
              <p className="text-3xl font-bold font-mono text-zinc-100">
                {status.currentFastHours.toFixed(1)} h
                <span className="text-sm font-normal text-zinc-400"> / {fastingTargetHours} h</span>
              </p>
              {status.lastMealAt && (
                <p className="text-xs text-zinc-500">
                  Dernier repas : {new Date(status.lastMealAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-2xl bg-zinc-950 border border-zinc-800 px-4 py-2.5">
              <div className="text-xs text-zinc-400">Série</div>
              <div className="text-lg font-bold font-mono text-emerald-400">{status.streakDays} j</div>
            </div>
            <div className="rounded-2xl bg-zinc-950 border border-zinc-800 px-4 py-2.5">
              <div className="text-xs text-zinc-400">Moyenne</div>
              <div className="text-lg font-bold font-mono">{status.averageFastHours} h</div>
            </div>
          </div>
        </div>

        {/* Barre de progression */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-zinc-400">
            <span>Progression vers l&apos;objectif</span>
            <span className="font-mono text-emerald-400">{status.progressPct}%</span>
          </div>
          <div className="h-3 rounded-full bg-zinc-950 overflow-hidden border border-zinc-800">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all"
              style={{ width: `${status.progressPct}%` }}
            />
          </div>
        </div>

        {/* Protocoles */}
        <div className="space-y-2">
          <p className="text-xs text-zinc-400">Protocole cible :</p>
          <div className="flex flex-wrap gap-2">
            {PROTOCOLS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => onChangeTargetHours(p.hours)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                  fastingTargetHours === p.hours
                    ? "bg-emerald-500 text-zinc-950 border-emerald-500 font-semibold"
                    : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Historique automatique */}
      <section className="rounded-3xl bg-zinc-900/80 border border-zinc-800 p-5 space-y-3">
        <h3 className="text-sm font-semibold">Historique des fenêtres (14 derniers jours)</h3>
        <div className="divide-y divide-zinc-800/80">
          {status.dailyFasts.map((d) => (
            <div key={d.date} className="py-2.5 flex items-center justify-between text-xs">
              <div>
                <span className="font-mono text-zinc-200">{d.date}</span>
                <span className="text-zinc-500 ml-3">
                  1er repas {d.firstMealTime ?? "—"} · Dernier {d.lastMealTime ?? "—"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold">
                  {d.fastHours !== null ? `${d.fastHours} h` : "—"}
                </span>
                {d.fastHours !== null && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      d.metTarget
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {d.metTarget ? "Validé" : "Partiel"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
