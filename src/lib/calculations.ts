import {
  ActivityLevel,
  FastingStatus,
  FoodLogEntry,
  NutrientValues,
  StepEntry,
  TrendDirection,
  UserProfile,
  WeightEntry,
  WeightPointWithTrends,
  WeightTrendAnalysis,
} from "./types";

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function scaleNutrients(per100g: NutrientValues, quantityG: number): NutrientValues {
  const factor = quantityG / 100;
  const micronutrients: NutrientValues["micronutrients"] = {};
  for (const [k, v] of Object.entries(per100g.micronutrients)) {
    if (typeof v === "number") {
      micronutrients[k as keyof typeof micronutrients] = round1(v * factor);
    }
  }
  return {
    kcal: Math.round(per100g.kcal * factor),
    proteinG: round1(per100g.proteinG * factor),
    carbsG: round1(per100g.carbsG * factor),
    fatG: round1(per100g.fatG * factor),
    micronutrients,
  };
}

export function sumNutrients(entries: NutrientValues[]): NutrientValues {
  const totals: NutrientValues = {
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    micronutrients: {},
  };
  for (const entry of entries) {
    totals.kcal += entry.kcal;
    totals.proteinG += entry.proteinG;
    totals.carbsG += entry.carbsG;
    totals.fatG += entry.fatG;
    for (const [k, v] of Object.entries(entry.micronutrients)) {
      if (typeof v === "number") {
        const key = k as keyof typeof totals.micronutrients;
        totals.micronutrients[key] = round1((totals.micronutrients[key] ?? 0) + v);
      }
    }
  }
  totals.kcal = Math.round(totals.kcal);
  totals.proteinG = round1(totals.proteinG);
  totals.carbsG = round1(totals.carbsG);
  totals.fatG = round1(totals.fatG);
  return totals;
}

/**
 * Calcule les moyennes mobiles 3j et 5j sur la série de poids triée par date croissante.
 */
export function computeWeightSeriesWithTrends(weights: WeightEntry[]): WeightPointWithTrends[] {
  const sorted = [...weights].sort((a, b) => a.logDate.localeCompare(b.logDate));
  return sorted.map((entry, idx) => {
    const slice3 = sorted.slice(Math.max(0, idx - 2), idx + 1);
    const slice5 = sorted.slice(Math.max(0, idx - 4), idx + 1);
    const ma3 = round2(slice3.reduce((acc, w) => acc + w.weightKg, 0) / slice3.length);
    const ma5 = round2(slice5.reduce((acc, w) => acc + w.weightKg, 0) / slice5.length);
    return {
      logDate: entry.logDate,
      weightKg: entry.weightKg,
      ma3,
      ma5,
    };
  });
}

function classifySlope(slopeKgPerWeek: number | null, thresholdKgWeek: number): TrendDirection {
  if (slopeKgPerWeek === null) return "maintenance";
  if (slopeKgPerWeek <= -Math.abs(thresholdKgWeek)) return "baisse";
  if (slopeKgPerWeek >= Math.abs(thresholdKgWeek)) return "hausse";
  return "maintenance";
}

function linearSlopeKgPerDay(points: { dayOffset: number; value: number }[]): number | null {
  if (points.length < 2) return null;
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.dayOffset, 0);
  const sumY = points.reduce((s, p) => s + p.value, 0);
  const sumXY = points.reduce((s, p) => s + p.dayOffset * p.value, 0);
  const sumXX = points.reduce((s, p) => s + p.dayOffset * p.dayOffset, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

export function analyzeWeightTrends(
  weights: WeightEntry[],
  thresholdKgWeek = 0.15
): WeightTrendAnalysis {
  const series = computeWeightSeriesWithTrends(weights);
  if (series.length === 0) {
    return {
      latestWeight: null,
      ma3Latest: null,
      ma5Latest: null,
      slope3KgPerWeek: null,
      slope5KgPerWeek: null,
      status3: "maintenance",
      status5: "maintenance",
      delta3Kg: null,
      delta5Kg: null,
    };
  }

  const latest = series[series.length - 1];
  const tail3 = series.slice(-3);
  const tail5 = series.slice(-5);

  const toOffsets = (pts: WeightPointWithTrends[], key: "ma3" | "ma5") => {
    const t0 = new Date(pts[0].logDate).getTime();
    return pts.map((p) => ({
      dayOffset: Math.round((new Date(p.logDate).getTime() - t0) / 86400000),
      value: p[key] ?? p.weightKg,
    }));
  };

  const s3Day = linearSlopeKgPerDay(toOffsets(tail3, "ma3"));
  const s5Day = linearSlopeKgPerDay(toOffsets(tail5, "ma5"));

  const slope3KgPerWeek = s3Day !== null ? round2(s3Day * 7) : null;
  const slope5KgPerWeek = s5Day !== null ? round2(s5Day * 7) : null;

  const delta3Kg =
    tail3.length >= 2 && latest.ma3 !== null && tail3[0].ma3 !== null
      ? round2(latest.ma3 - tail3[0].ma3)
      : null;
  const delta5Kg =
    tail5.length >= 2 && latest.ma5 !== null && tail5[0].ma5 !== null
      ? round2(latest.ma5 - tail5[0].ma5)
      : null;

  return {
    latestWeight: latest.weightKg,
    ma3Latest: latest.ma3,
    ma5Latest: latest.ma5,
    slope3KgPerWeek,
    slope5KgPerWeek,
    status3: classifySlope(slope3KgPerWeek, thresholdKgWeek),
    status5: classifySlope(slope5KgPerWeek, thresholdKgWeek),
    delta3Kg,
    delta5Kg,
  };
}

/**
 * Calculateur TDEE théorique (Mifflin-St Jeor & Katch-McArdle) + TDEE adaptatif empirique.
 */
export function calculateTdee(params: {
  profile: UserProfile;
  weightKg: number;
  foodLogs: FoodLogEntry[];
  weights: WeightEntry[];
}): {
  bmrMifflin: number;
  bmrKatch: number | null;
  tdeeTheoretical: number;
  tdeeAdaptive: number | null;
  adaptiveConfidence: "faible" | "moyenne" | "élevée";
} {
  const { profile, weightKg, foodLogs, weights } = params;
  const s = profile.sex === "male" ? 5 : -161;
  const bmrMifflin = Math.round(10 * weightKg + 6.25 * profile.heightCm - 5 * profile.age + s);

  let bmrKatch: number | null = null;
  if (typeof profile.bodyFatPct === "number" && profile.bodyFatPct > 2 && profile.bodyFatPct < 65) {
    const leanMass = weightKg * (1 - profile.bodyFatPct / 100);
    bmrKatch = Math.round(370 + 21.6 * leanMass);
  }

  const baseBmr = bmrKatch ?? bmrMifflin;
  const tdeeTheoretical = Math.round(baseBmr * ACTIVITY_MULTIPLIERS[profile.activityLevel]);

  // TDEE adaptatif sur les 14 à 28 derniers jours
  const series = computeWeightSeriesWithTrends(weights);
  let tdeeAdaptive: number | null = null;
  let adaptiveConfidence: "faible" | "moyenne" | "élevée" = "faible";

  if (series.length >= 7) {
    const recentSeries = series.slice(-21);
    const startDate = recentSeries[0].logDate;
    const endDate = recentSeries[recentSeries.length - 1].logDate;
    const daysSpan = Math.max(
      1,
      Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000)
    );

    const kcalByDate = new Map<string, number>();
    for (const log of foodLogs) {
      if (log.logDate >= startDate && log.logDate <= endDate) {
        kcalByDate.set(log.logDate, (kcalByDate.get(log.logDate) ?? 0) + log.nutrients.kcal);
      }
    }

    const loggedDays = Array.from(kcalByDate.values()).filter((k) => k > 400);
    if (loggedDays.length >= 5 && daysSpan >= 6) {
      const avgKcal = loggedDays.reduce((a, b) => a + b, 0) / loggedDays.length;
      const startMa = recentSeries[0].ma5 ?? recentSeries[0].weightKg;
      const endMa = recentSeries[recentSeries.length - 1].ma5 ?? recentSeries[recentSeries.length - 1].weightKg;
      const weightDeltaKg = endMa - startMa;
      // 1 kg de masse corporelle mixte ≈ 7700 kcal
      const dailyEnergyBalance = (weightDeltaKg * 7700) / daysSpan;
      const rawAdaptive = Math.round(avgKcal - dailyEnergyBalance);

      if (rawAdaptive >= 1000 && rawAdaptive <= 5500) {
        tdeeAdaptive = rawAdaptive;
        adaptiveConfidence =
          loggedDays.length >= 14 ? "élevée" : loggedDays.length >= 8 ? "moyenne" : "faible";
      }
    }
  }

  return {
    bmrMifflin,
    bmrKatch,
    tdeeTheoretical,
    tdeeAdaptive,
    adaptiveConfidence,
  };
}

/**
 * Calcul automatique du jeûne intermittent à partir des horaires du premier et dernier repas loggés.
 */
export function computeAutomaticFasting(
  foodLogs: FoodLogEntry[],
  targetHours: number
): FastingStatus {
  const sortedLogs = [...foodLogs].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  if (sortedLogs.length === 0) {
    return {
      isCurrentlyFasting: false,
      currentFastHours: 0,
      lastMealAt: null,
      targetHours,
      progressPct: 0,
      dailyFasts: [],
      averageFastHours: 0,
      streakDays: 0,
    };
  }

  const lastMeal = sortedLogs[sortedLogs.length - 1];
  const lastMealTimeMs = new Date(lastMeal.loggedAt).getTime();
  const currentFastHours = round1(Math.max(0, (Date.now() - lastMealTimeMs) / 3600000));
  const progressPct = Math.min(100, Math.round((currentFastHours / targetHours) * 100));

  // Grouper par date pour trouver premier & dernier repas de chaque jour
  const byDate = new Map<string, FoodLogEntry[]>();
  for (const log of sortedLogs) {
    const list = byDate.get(log.logDate) ?? [];
    list.push(log);
    byDate.set(log.logDate, list);
  }

  const dates = Array.from(byDate.keys()).sort();
  const dailyFasts: FastingStatus["dailyFasts"] = [];

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const dayLogs = byDate.get(date)!;
    const first = dayLogs[0];
    const last = dayLogs[dayLogs.length - 1];

    let fastHours: number | null = null;
    if (i > 0) {
      const prevLogs = byDate.get(dates[i - 1])!;
      const prevLast = prevLogs[prevLogs.length - 1];
      const diffHours =
        (new Date(first.loggedAt).getTime() - new Date(prevLast.loggedAt).getTime()) / 3600000;
      if (diffHours >= 4 && diffHours <= 48) {
        fastHours = round1(diffHours);
      }
    }

    dailyFasts.push({
      date,
      firstMealTime: formatTimeHHMM(first.loggedAt),
      lastMealTime: formatTimeHHMM(last.loggedAt),
      fastHours,
      metTarget: fastHours !== null ? fastHours >= targetHours : false,
    });
  }

  const completed = dailyFasts.filter((d) => d.fastHours !== null);
  const averageFastHours =
    completed.length > 0
      ? round1(completed.reduce((s, d) => s + (d.fastHours ?? 0), 0) / completed.length)
      : 0;

  let streakDays = 0;
  for (let i = completed.length - 1; i >= 0; i--) {
    if (completed[i].metTarget) streakDays++;
    else break;
  }

  return {
    isCurrentlyFasting: currentFastHours >= 1,
    currentFastHours,
    lastMealAt: lastMeal.loggedAt,
    targetHours,
    progressPct,
    dailyFasts: dailyFasts.slice(-14).reverse(),
    averageFastHours,
    streakDays,
  };
}

/**
 * Agrège les pas par semaine ou par mois pour les graphiques d'évolution.
 */
export function aggregateSeriesByRange<T extends { date: string; value: number }>(
  points: T[],
  range: "week" | "month" | "year"
): { label: string; value: number; date: string }[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  if (range === "week") {
    return sorted.slice(-7).map((p) => ({
      label: formatShortDate(p.date),
      value: p.value,
      date: p.date,
    }));
  }
  if (range === "month") {
    return sorted.slice(-30).map((p) => ({
      label: formatShortDate(p.date),
      value: p.value,
      date: p.date,
    }));
  }
  // Year: moyenne mensuelle
  const byMonth = new Map<string, number[]>();
  for (const p of sorted.slice(-365)) {
    const ym = p.date.slice(0, 7);
    const arr = byMonth.get(ym) ?? [];
    arr.push(p.value);
    byMonth.set(ym, arr);
  }
  return Array.from(byMonth.entries()).map(([ym, vals]) => ({
    label: ym,
    value: round1(vals.reduce((a, b) => a + b, 0) / vals.length),
    date: `${ym}-01`,
  }));
}

export function parseStepsImportText(
  rawText: string
): { entries: StepEntry[]; format: "import_csv" | "import_apple" | "import_google" } {
  const trimmed = rawText.trim();
  if (!trimmed) return { entries: [], format: "import_csv" };

  // JSON (Google Takeout / Apple export JSON)
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : parsed.data ?? parsed.steps ?? [];
      const entries: StepEntry[] = [];
      for (const item of arr) {
        const date = String(item.date ?? item.logDate ?? item.startDate ?? "").slice(0, 10);
        const steps = Number(item.steps ?? item.value ?? item.count ?? 0);
        if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(steps) && steps >= 0) {
          entries.push({ logDate: date, steps: Math.round(steps), source: "import_google" });
        }
      }
      return { entries, format: "import_google" };
    } catch {
      return { entries: [], format: "import_csv" };
    }
  }

  // CSV: date,steps
  const lines = trimmed.split(/\r?\n/);
  const entries: StepEntry[] = [];
  for (const line of lines) {
    const parts = line.split(/[;,]/).map((s) => s.trim().replace(/^"|"$/g, ""));
    if (parts.length < 2) continue;
    const dateMatch = parts[0].match(/\d{4}-\d{2}-\d{2}/);
    const stepsNum = Number(parts[1]);
    if (dateMatch && Number.isFinite(stepsNum) && stepsNum >= 0) {
      entries.push({
        logDate: dateMatch[0],
        steps: Math.round(stepsNum),
        source: "import_csv",
      });
    }
  }
  return { entries, format: "import_csv" };
}

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function formatTimeHHMM(iso: string): string {
  const dt = new Date(iso);
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
