export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type GoalType = "cut" | "maintain" | "bulk";
export type MacroMode = "grams" | "percent" | "per_kg";
export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";
export type LogSource = "manual" | "barcode" | "gemini_photo" | "gemini_text" | "recipe";
export type TrendDirection = "baisse" | "maintenance" | "hausse";
export type ChartRange = "week" | "month" | "year";

export type MicronutrientKey =
  | "fiber_g"
  | "sugar_g"
  | "saturated_fat_g"
  | "sodium_mg"
  | "potassium_mg"
  | "iron_mg"
  | "calcium_mg"
  | "magnesium_mg"
  | "vitamin_c_mg"
  | "vitamin_d_ug"
  | "vitamin_b12_ug"
  | "zinc_mg"
  | "omega3_g";

export interface MicronutrientMeta {
  key: MicronutrientKey;
  label: string;
  unit: string;
  defaultTarget: number;
  isLimit?: boolean; // e.g., sugar, saturated fat, sodium
}

export const MICRONUTRIENT_CATALOG: MicronutrientMeta[] = [
  { key: "fiber_g", label: "Fibres", unit: "g", defaultTarget: 30 },
  { key: "sugar_g", label: "Sucres", unit: "g", defaultTarget: 50, isLimit: true },
  { key: "saturated_fat_g", label: "Acides gras saturés", unit: "g", defaultTarget: 22, isLimit: true },
  { key: "sodium_mg", label: "Sodium", unit: "mg", defaultTarget: 2300, isLimit: true },
  { key: "potassium_mg", label: "Potassium", unit: "mg", defaultTarget: 3500 },
  { key: "iron_mg", label: "Fer", unit: "mg", defaultTarget: 14 },
  { key: "calcium_mg", label: "Calcium", unit: "mg", defaultTarget: 1000 },
  { key: "magnesium_mg", label: "Magnésium", unit: "mg", defaultTarget: 380 },
  { key: "vitamin_c_mg", label: "Vitamine C", unit: "mg", defaultTarget: 110 },
  { key: "vitamin_d_ug", label: "Vitamine D", unit: "µg", defaultTarget: 15 },
  { key: "vitamin_b12_ug", label: "Vitamine B12", unit: "µg", defaultTarget: 4 },
  { key: "zinc_mg", label: "Zinc", unit: "mg", defaultTarget: 11 },
  { key: "omega3_g", label: "Oméga-3", unit: "g", defaultTarget: 2 },
];

export interface UserProfile {
  displayName: string;
  sex: Sex;
  age: number;
  heightCm: number;
  activityLevel: ActivityLevel;
  bodyFatPct?: number;
  theme: "dark" | "light";
  fastingTargetHours: number;
  weightTrendThresholdKgWeek: number;
  adaptiveTdeeEnabled: boolean;
  pinnedMicronutrients: MicronutrientKey[];
}

export interface NutritionGoals {
  goalType: GoalType;
  targetKcal: number;
  macroMode: MacroMode;
  proteinG: number;
  carbsG: number;
  fatG: number;
  targetSteps: number;
  targetWaterMl: number;
  micronutrientTargets: Partial<Record<MicronutrientKey, number>>;
}

export interface NutrientValues {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  micronutrients: Partial<Record<MicronutrientKey, number>>;
}

export interface FoodItem {
  id: string;
  barcode?: string;
  name: string;
  brand?: string;
  servingSizeG: number;
  servingLabel: string;
  per100g: NutrientValues;
  source: "manual" | "openfoodfacts" | "gemini" | "recipe";
}

export interface FoodLogEntry {
  id: string;
  logDate: string; // YYYY-MM-DD
  loggedAt: string; // ISO timestamp for automatic fasting calculation
  mealSlot: MealSlot;
  foodName: string;
  brand?: string;
  barcode?: string;
  quantityG: number;
  nutrients: NutrientValues;
  source: LogSource;
}

export interface RecipeItem {
  foodName: string;
  quantityG: number;
  per100g: NutrientValues;
}

export interface Recipe {
  id: string;
  name: string;
  servings: number;
  items: RecipeItem[];
  perServing: NutrientValues;
}

export interface WeightEntry {
  logDate: string; // YYYY-MM-DD
  weightKg: number;
  note?: string;
}

export interface StepEntry {
  logDate: string; // YYYY-MM-DD
  steps: number;
  source: "manual" | "import_apple" | "import_google" | "import_csv";
}

export interface WaterEntry {
  id: string;
  logDate: string;
  amountMl: number;
  loggedAt: string;
}

export interface WeightPointWithTrends {
  logDate: string;
  weightKg: number;
  ma3: number | null;
  ma5: number | null;
}

export interface WeightTrendAnalysis {
  latestWeight: number | null;
  ma3Latest: number | null;
  ma5Latest: number | null;
  slope3KgPerWeek: number | null;
  slope5KgPerWeek: number | null;
  status3: TrendDirection;
  status5: TrendDirection;
  delta3Kg: number | null;
  delta5Kg: number | null;
}

export interface FastingStatus {
  isCurrentlyFasting: boolean;
  currentFastHours: number;
  lastMealAt: string | null;
  targetHours: number;
  progressPct: number;
  dailyFasts: {
    date: string;
    firstMealTime: string | null;
    lastMealTime: string | null;
    fastHours: number | null;
    metTarget: boolean;
  }[];
  averageFastHours: number;
  streakDays: number;
}

export interface GeminiDetectedFood {
  name: string;
  estimatedGrams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  sugarG?: number;
  saturatedFatG?: number;
  sodiumMg?: number;
  confidence?: "high" | "medium" | "low";
}
