import {
  FoodItem,
  FoodLogEntry,
  NutritionGoals,
  Recipe,
  StepEntry,
  UserProfile,
  WaterEntry,
  WeightEntry,
} from "./types";

export interface AppState {
  profile: UserProfile;
  goals: NutritionGoals;
  foods: FoodItem[];
  recipes: Recipe[];
  foodLogs: FoodLogEntry[];
  weights: WeightEntry[];
  steps: StepEntry[];
  waterLogs: WaterEntry[];
  dailyNotes?: Record<string, string>;
}

const STORAGE_KEY = "macropulse_state_v1";

export const EMPTY_APP_STATE: AppState = {
  profile: {
    displayName: "Utilisateur",
    sex: "male",
    age: 29,
    heightCm: 178,
    activityLevel: "moderate",
    theme: "dark",
    weightTrendThresholdKgWeek: 0.15,
    adaptiveTdeeEnabled: true,
    pinnedMicronutrients: ["fiber_g", "sugar_g", "saturated_fat_g", "sodium_mg"],
  },
  goals: {
    goalType: "maintain",
    targetKcal: 2150,
    macroMode: "grams",
    proteinG: 160,
    carbsG: 215,
    fatG: 70,
    targetSteps: 10000,
    targetWaterMl: 2500,
    micronutrientTargets: {},
  },
  foods: [],
  recipes: [],
  foodLogs: [],
  weights: [],
  steps: [],
  waterLogs: [],
};

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function createInitialDemoState(): AppState {
  const profile: UserProfile = {
    displayName: "Hugo",
    sex: "male",
    age: 29,
    heightCm: 178,
    activityLevel: "moderate",
    bodyFatPct: 15.5,
    theme: "dark",
    weightTrendThresholdKgWeek: 0.15,
    adaptiveTdeeEnabled: true,
    pinnedMicronutrients: [
      "fiber_g",
      "sugar_g",
      "saturated_fat_g",
      "sodium_mg",
      "iron_mg",
      "magnesium_mg",
      "vitamin_d_ug",
    ],
  };

  const goals: NutritionGoals = {
    goalType: "cut",
    targetKcal: 2150,
    macroMode: "grams",
    proteinG: 165,
    carbsG: 215,
    fatG: 70,
    targetSteps: 10000,
    targetWaterMl: 2500,
    micronutrientTargets: {
      fiber_g: 32,
      sugar_g: 45,
      saturated_fat_g: 22,
      sodium_mg: 2300,
      iron_mg: 14,
      magnesium_mg: 380,
      vitamin_d_ug: 15,
    },
  };

  const foods: FoodItem[] = [
    {
      id: "food-chicken",
      name: "Blanc de poulet grillé",
      servingSizeG: 150,
      servingLabel: "150 g",
      per100g: {
        kcal: 165,
        proteinG: 31,
        carbsG: 0,
        fatG: 3.6,
        micronutrients: { sodium_mg: 74, potassium_mg: 256, iron_mg: 1.0, magnesium_mg: 29 },
      },
      source: "manual",
    },
    {
      id: "food-rice",
      name: "Riz basmati cuit",
      servingSizeG: 200,
      servingLabel: "200 g",
      per100g: {
        kcal: 130,
        proteinG: 2.7,
        carbsG: 28,
        fatG: 0.3,
        micronutrients: { fiber_g: 0.4, magnesium_mg: 12, iron_mg: 0.2 },
      },
      source: "manual",
    },
    {
      id: "food-skyr",
      name: "Skyr nature 0%",
      brand: "Siggi's / Danone",
      servingSizeG: 150,
      servingLabel: "1 pot (150 g)",
      per100g: {
        kcal: 62,
        proteinG: 10.6,
        carbsG: 4.0,
        fatG: 0.2,
        micronutrients: { sugar_g: 4.0, calcium_mg: 130, sodium_mg: 40 },
      },
      source: "manual",
    },
    {
      id: "food-oats",
      name: "Flocons d'avoine complets",
      servingSizeG: 60,
      servingLabel: "60 g",
      per100g: {
        kcal: 372,
        proteinG: 13.5,
        carbsG: 58.7,
        fatG: 7.0,
        micronutrients: { fiber_g: 10.0, magnesium_mg: 138, iron_mg: 4.2, zinc_mg: 3.6 },
      },
      source: "manual",
    },
  ];

  const recipes: Recipe[] = [
    {
      id: "rec-bowl",
      name: "Bowl Poulet Riz Avocat",
      servings: 1,
      items: [
        { foodName: "Blanc de poulet grillé", quantityG: 160, per100g: foods[0].per100g },
        { foodName: "Riz basmati cuit", quantityG: 220, per100g: foods[1].per100g },
      ],
      perServing: {
        kcal: 550,
        proteinG: 55.5,
        carbsG: 61.6,
        fatG: 6.4,
        micronutrients: { fiber_g: 0.9, sodium_mg: 118, magnesium_mg: 73 },
      },
    },
  ];

  // 14 jours d'historique réaliste
  const weightSeries = [
    78.6, 78.4, 78.7, 78.2, 78.0, 78.1, 77.8, 77.6, 77.7, 77.4, 77.2, 77.3, 77.0, 76.9,
  ];
  const weights: WeightEntry[] = weightSeries.map((w, idx) => ({
    logDate: daysAgoISO(13 - idx),
    weightKg: w,
  }));

  const stepSeries = [
    8420, 10340, 7650, 11200, 9850, 12450, 6900, 10800, 11400, 9200, 10550, 11900, 8950, 7420,
  ];
  const steps: StepEntry[] = stepSeries.map((s, idx) => ({
    logDate: daysAgoISO(13 - idx),
    steps: s,
    source: "manual",
  }));

  const foodLogs: FoodLogEntry[] = [];
  const dailyKcals = [
    2180, 2090, 2240, 2110, 2050, 2190, 2320, 2120, 2080, 2150, 2060, 2140, 2095, 1420,
  ];

  dailyKcals.forEach((kcal, idx) => {
    const date = daysAgoISO(13 - idx);
    const isToday = idx === 13;

    // Premier repas vers 12:15
    foodLogs.push({
      id: `demo-${date}-lunch`,
      logDate: date,
      loggedAt: `${date}T12:15:00`,
      mealSlot: "lunch",
      foodName: "Bowl Poulet Riz & Légumes",
      quantityG: 420,
      nutrients: {
        kcal: Math.round(kcal * 0.48),
        proteinG: 62,
        carbsG: 78,
        fatG: 18,
        micronutrients: { fiber_g: 11, sugar_g: 7, saturated_fat_g: 4.5, sodium_mg: 680, magnesium_mg: 110, iron_mg: 4.2 },
      },
      source: "recipe",
    });

    if (!isToday) {
      foodLogs.push({
        id: `demo-${date}-snack`,
        logDate: date,
        loggedAt: `${date}T16:30:00`,
        mealSlot: "snack",
        foodName: "Skyr nature + Flocons d'avoine",
        quantityG: 220,
        nutrients: {
          kcal: Math.round(kcal * 0.17),
          proteinG: 26,
          carbsG: 34,
          fatG: 5,
          micronutrients: { fiber_g: 5, sugar_g: 9, saturated_fat_g: 1.2, sodium_mg: 90, calcium_mg: 220 },
        },
        source: "manual",
      });

      foodLogs.push({
        id: `demo-${date}-dinner`,
        logDate: date,
        loggedAt: `${date}T20:00:00`,
        mealSlot: "dinner",
        foodName: "Saumon grillé, patate douce & brocolis",
        quantityG: 400,
        nutrients: {
          kcal: Math.round(kcal * 0.35),
          proteinG: 54,
          carbsG: 65,
          fatG: 28,
          micronutrients: {
            fiber_g: 12,
            sugar_g: 9,
            saturated_fat_g: 7.5,
            sodium_mg: 540,
            vitamin_d_ug: 11,
            magnesium_mg: 135,
            iron_mg: 3.8,
          },
        },
        source: "gemini_photo",
      });
    } else {
      foodLogs.push({
        id: `demo-${date}-snack`,
        logDate: date,
        loggedAt: `${date}T16:10:00`,
        mealSlot: "snack",
        foodName: "Skyr nature 0% & Amandes",
        quantityG: 180,
        nutrients: {
          kcal: Math.round(kcal * 0.52),
          proteinG: 34,
          carbsG: 28,
          fatG: 19,
          micronutrients: { fiber_g: 6, sugar_g: 8, saturated_fat_g: 2.1, sodium_mg: 110, magnesium_mg: 95 },
        },
        source: "barcode",
      });
    }
  });

  const waterLogs: WaterEntry[] = [
    { id: "w-1", logDate: daysAgoISO(0), amountMl: 500, loggedAt: `${daysAgoISO(0)}T09:00:00` },
    { id: "w-2", logDate: daysAgoISO(0), amountMl: 750, loggedAt: `${daysAgoISO(0)}T13:30:00` },
  ];

  return {
    profile,
    goals,
    foods,
    recipes,
    foodLogs,
    weights,
    steps,
    waterLogs,
  };
}

export function loadAppState(): AppState {
  if (typeof window === "undefined") return createInitialDemoState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createInitialDemoState();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw) as AppState;
  } catch {
    return createInitialDemoState();
  }
}

export type SaveStateResult =
  | { ok: true }
  | { ok: false; quotaExceeded: boolean; message: string };

export function saveAppState(state: AppState): SaveStateResult {
  if (typeof window === "undefined") return { ok: true };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (err) {
    const quotaExceeded =
      err instanceof DOMException &&
      (err.name === "QuotaExceededError" ||
        err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        err.code === 22 ||
        err.code === 1014);
    return {
      ok: false,
      quotaExceeded,
      message: quotaExceeded
        ? "Espace de stockage local saturé : impossible d'enregistrer les dernières modifications. Exporte une sauvegarde JSON et libère de l'espace."
        : "Impossible d'enregistrer les données localement (stockage bloqué ou navigation privée).",
    };
  }
}

export type ImportAppStateResult =
  | {
      ok: true;
      state: AppState;
      summary: {
        foodLogs: number;
        foods: number;
        recipes: number;
        weights: number;
        steps: number;
      };
    }
  | { ok: false; error: string };

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function parseImportedAppState(raw: string): ImportAppStateResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Le fichier n'est pas un JSON valide." };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, error: "Format de sauvegarde invalide (objet JSON attendu)." };
  }

  if (!isPlainObject(parsed.profile) || !isPlainObject(parsed.goals)) {
    return {
      ok: false,
      error: "Ce fichier ne semble pas être une sauvegarde MacroPulse (profil ou objectifs manquants).",
    };
  }

  const arrayFields = ["foods", "recipes", "foodLogs", "weights", "steps", "waterLogs"] as const;
  for (const field of arrayFields) {
    if (parsed[field] !== undefined && !Array.isArray(parsed[field])) {
      return {
        ok: false,
        error: `Champ "${field}" invalide dans la sauvegarde (liste attendue).`,
      };
    }
  }

  if (!Array.isArray(parsed.foodLogs)) {
    return {
      ok: false,
      error: "Champ \"foodLogs\" manquant dans la sauvegarde MacroPulse.",
    };
  }

  if (parsed.dailyNotes !== undefined && !isPlainObject(parsed.dailyNotes)) {
    return {
      ok: false,
      error: "Champ \"dailyNotes\" invalide dans la sauvegarde.",
    };
  }

  const profile: UserProfile = {
    ...EMPTY_APP_STATE.profile,
    ...(parsed.profile as Partial<UserProfile>),
    pinnedMicronutrients: Array.isArray(parsed.profile.pinnedMicronutrients)
      ? (parsed.profile.pinnedMicronutrients as UserProfile["pinnedMicronutrients"])
      : EMPTY_APP_STATE.profile.pinnedMicronutrients,
  };

  const goals: NutritionGoals = {
    ...EMPTY_APP_STATE.goals,
    ...(parsed.goals as Partial<NutritionGoals>),
    micronutrientTargets: isPlainObject(parsed.goals.micronutrientTargets)
      ? (parsed.goals.micronutrientTargets as NutritionGoals["micronutrientTargets"])
      : EMPTY_APP_STATE.goals.micronutrientTargets,
  };

  const state: AppState = {
    profile,
    goals,
    foods: (parsed.foods as FoodItem[] | undefined) ?? [],
    recipes: (parsed.recipes as Recipe[] | undefined) ?? [],
    foodLogs: parsed.foodLogs as FoodLogEntry[],
    weights: (parsed.weights as WeightEntry[] | undefined) ?? [],
    steps: (parsed.steps as StepEntry[] | undefined) ?? [],
    waterLogs: (parsed.waterLogs as WaterEntry[] | undefined) ?? [],
    ...(parsed.dailyNotes
      ? { dailyNotes: parsed.dailyNotes as Record<string, string> }
      : {}),
  };

  return {
    ok: true,
    state,
    summary: {
      foodLogs: state.foodLogs.length,
      foods: state.foods.length,
      recipes: state.recipes.length,
      weights: state.weights.length,
      steps: state.steps.length,
    },
  };
}

export function exportAppStateAsJSON(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function exportFoodLogsAsCSV(logs: FoodLogEntry[]): string {
  const header = "date,heure,repas,aliment,quantite_g,kcal,proteines_g,glucides_g,lipides_g,source";
  const rows = logs.map((l) =>
    [
      l.logDate,
      l.loggedAt.slice(11, 16),
      l.mealSlot,
      `"${l.foodName.replace(/"/g, '""')}"`,
      l.quantityG,
      l.nutrients.kcal,
      l.nutrients.proteinG,
      l.nutrients.carbsG,
      l.nutrients.fatG,
      l.source,
    ].join(",")
  );
  return [header, ...rows].join("\n");
}
