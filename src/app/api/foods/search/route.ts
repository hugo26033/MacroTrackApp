import { NextRequest, NextResponse } from "next/server";
import type { FoodItem, MicronutrientKey } from "@/lib/types";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ products: [] });
  }

  try {
    const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
    url.searchParams.set("search_terms", q);
    url.searchParams.set("search_simple", "1");
    url.searchParams.set("action", "process");
    url.searchParams.set("json", "1");
    url.searchParams.set("page_size", "12");
    url.searchParams.set("lc", "fr");
    url.searchParams.set("cc", "fr");
    url.searchParams.set(
      "fields",
      "code,product_name,product_name_fr,brands,serving_quantity,serving_size,nutriments"
    );

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "MacroPulse-PWA/1.0 (contact@macropulse.local)",
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Open Food Facts indisponible pour le moment.", products: [] },
        { status: 502 }
      );
    }

    const data = await res.json();
    const rawProducts = Array.isArray(data.products) ? data.products : [];

    const num = (v: unknown): number => {
      const parsed = Number(v);
      return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : 0;
    };

    const products: FoodItem[] = rawProducts
      .filter((p: Record<string, unknown>) => p.product_name_fr || p.product_name)
      .map((p: Record<string, unknown>, idx: number) => {
        const n = (p.nutriments ?? {}) as Record<string, unknown>;
        const kcal =
          num(n["energy-kcal_100g"]) ||
          Math.round(num(n["energy-kj_100g"]) / 4.184) ||
          Math.round(
            num(n.proteins_100g) * 4 + num(n.carbohydrates_100g) * 4 + num(n.fat_100g) * 9
          );

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
        };

        const servingSizeG = num(p.serving_quantity) || 100;
        const code = p.code ? String(p.code) : undefined;

        return {
          id: code ? `off-${code}` : `off-search-${idx}-${Date.now()}`,
          barcode: code,
          name: String(p.product_name_fr || p.product_name),
          brand: p.brands ? String(p.brands) : undefined,
          servingSizeG,
          servingLabel: p.serving_size ? String(p.serving_size) : `${servingSizeG} g`,
          per100g: {
            kcal,
            proteinG: num(n.proteins_100g),
            carbsG: num(n.carbohydrates_100g),
            fatG: num(n.fat_100g),
            micronutrients,
          },
          source: "openfoodfacts" as const,
        };
      });

    return NextResponse.json({ products });
  } catch {
    return NextResponse.json(
      { error: "Erreur réseau lors de la recherche Open Food Facts.", products: [] },
      { status: 500 }
    );
  }
}
