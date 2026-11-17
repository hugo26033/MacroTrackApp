import { NextRequest, NextResponse } from "next/server";
import { callGeminiJSON } from "@/lib/gemini";
import type { MealSlot } from "@/lib/types";

export const maxDuration = 30;

interface SuggestRequest {
  mode: "complete" | "plan_day";
  target: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  preference?: string;
  mealSlot?: MealSlot;
}

export interface SuggestedOptimizerFood {
  name: string;
  mealSlot: MealSlot;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  minG: number;
  maxG: number;
}

const PROMPT = `Tu es un nutritionniste expert. Propose une liste d'aliments simples et réalistes (pour 100g) qui permettront à un solveur mathématique d'atteindre exactement l'objectif nutritionnel donné.
Réponds STRICTEMENT en JSON valide respectant ce schéma :
{
  "foods": [
    {
      "name": "Blanc de poulet grillé",
      "mealSlot": "lunch",
      "kcalPer100g": 165,
      "proteinPer100g": 31,
      "carbsPer100g": 0,
      "fatPer100g": 3.6,
      "fiberPer100g": 0,
      "minG": 80,
      "maxG": 250
    }
  ]
}
Règles :
- "mealSlot" doit être parmi : "breakfast", "lunch", "dinner", "snack".
- Pour le mode "complete", mets tous les aliments sur le créneau demandé (3 à 5 aliments complémentaires : une source de protéines, une de glucides, une de lipides/légumes).
- Pour le mode "plan_day", propose 6 à 9 aliments répartis sur les 4 créneaux ("breakfast", "lunch", "dinner", "snack").
- Donne des valeurs nutritionnelles réalistes pour 100g et des bornes minG/maxG réalistes (ex: huile d'olive minG=5, maxG=25 ; poulet minG=80, maxG=250).`;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SuggestRequest;
    const userPrompt = `${PROMPT}

Mode : ${body.mode === "plan_day" ? "Planifier toute la journée" : `Compléter un repas (${body.mealSlot ?? "dinner"})`}
Cible : ${Math.round(body.target.kcal)} kcal, ${Math.round(body.target.proteinG)}g Protéines, ${Math.round(body.target.fatG)}g Lipides, ${Math.round(body.target.carbsG)}g Glucides.
Préférences / aliments disponibles : ${body.preference?.trim() || "Aucune contrainte particulière, alimentation équilibrée et simple."}`;

    const parsed = await callGeminiJSON<{ foods?: SuggestedOptimizerFood[] }>({
      parts: [{ text: userPrompt }],
      temperature: 0.3,
    });

    const foods = Array.isArray(parsed.foods) ? parsed.foods : [];
    return NextResponse.json({ foods });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Erreur suggestion Gemini : ${err.message}`
            : "Erreur inconnue.",
      },
      { status: 502 }
    );
  }
}
