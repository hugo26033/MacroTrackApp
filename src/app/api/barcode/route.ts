import { NextRequest, NextResponse } from "next/server";
import type { FoodItem, MicronutrientKey } from "@/lib/types";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim();
  if (!code || !/^\d{6,14}$/.test(code)) {
    return NextResponse.json(
      { error: "Code-barres invalide. Saisis 6 à 14 chiffres." },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`,
      {
        headers: {
          "User-Agent": "MacroPulse-PWA/1.0 (contact@macropulse.local)",
        },
        next: { revalidate: 86400 },
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "Impossible de joindre Open Food Facts." },
        { status: 502 }
      );
    }

    const data = await res.json();
    if (data.status !== 1 || !data.product) {
      return NextResponse.json(
        { error: "Produit introuvable sur Open Food Facts. Tu peux le créer manuellement." },
        { status: 404 }
      );
    }

    const p = data.product;
    const n = p.nutriments ?? {};

    const num = (v: unknown): number => {
      const parsed = Number(v);
      return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : 0;
    };

    const kcal =
      num(n["energy-kcal_100g"]) ||
      Math.round(num(n["energy-kj_100g"]) / 4.184) ||
      Math.round(num(n.proteins_100g) * 4 + num(n.carbohydrates_100g) * 4 + num(n.fat_100g) * 9);

    const micronutrients: Partial<Record<MicronutrientKey, number>> = {
      fiber_g: num(n.fiber_100g),
      sugar_g: num(n.sugars_100g),
      saturated_fat_g: num(n["saturated-fat_100g"]),
      sodium_mg: Math.round((num(n.sodium_100g) || num(n.salt_100g) * 0.4) * 1000),
      potassium_mg: Math.round(num(n.potassium_100g) * 1000),
      iron_mg: Math.round(num(n.iron_100g) * 1000 * 10) / 10,
      calcium_mg: Math.round(num(n.calcium_100g) * 1000),
      magnesium_mg: Math.round(num(n.magnesium_100g) * 1000),
      vitamin_c_mg: Math.round(num(n["vitamin-c_100g"]) * 1000),
      vitamin_d_ug: Math.round(num(n["vitamin-d_100g"]) * 1_000_000 * 10) / 10,
    };

    const servingSizeG = num(p.serving_quantity) || 100;

    const item: FoodItem = {
      id: `off-${code}`,
      barcode: code,
      name: p.product_name_fr || p.product_name || "Produit sans nom",
      brand: p.brands || undefined,
      servingSizeG,
      servingLabel: p.serving_size || `${servingSizeG} g`,
      per100g: {
        kcal,
        proteinG: num(n.proteins_100g),
        carbsG: num(n.carbohydrates_100g),
        fatG: num(n.fat_100g),
        micronutrients,
      },
      source: "openfoodfacts",
    };

    return NextResponse.json({ product: item });
  } catch {
    return NextResponse.json(
      { error: "Erreur réseau lors de la recherche Open Food Facts." },
      { status: 500 }
    );
  }
}
