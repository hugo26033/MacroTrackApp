import { NextRequest, NextResponse } from "next/server";
import type { FoodItem, MicronutrientKey } from "@/lib/types";

function normalizeProduct(p: Record<string, unknown>, idx: number): FoodItem | null {
  const rawName = p.product_name_fr || p.product_name;
  if (!rawName || typeof rawName !== "string") return null;

  const num = (v: unknown): number => {
    const parsed = Number(v);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : 0;
  };

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
  const brand = Array.isArray(p.brands)
    ? p.brands.filter(Boolean).join(", ")
    : p.brands
      ? String(p.brands)
      : undefined;

  return {
    id: code ? `off-${code}` : `off-search-${idx}-${Date.now()}`,
    barcode: code,
    name: rawName,
    brand: brand || undefined,
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
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ products: [] });
  }

  const headers = {
    "User-Agent": "MacroPulse-PWA/1.0 (https://github.com/hugo26033/MacroTrackApp)",
  };

  // 1. Moteur rapide Search-a-licious Open Food Facts (~10ms)
  try {
    const searchUrl = new URL("https://search.openfoodfacts.org/search");
    searchUrl.searchParams.set("q", q);
    searchUrl.searchParams.set("langs", "fr");
    searchUrl.searchParams.set("page_size", "12");
    searchUrl.searchParams.set(
      "fields",
      "code,product_name,brands,serving_quantity,serving_size,nutriments"
    );

    const res = await fetch(searchUrl.toString(), {
      headers,
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data = await res.json();
      const hits = Array.isArray(data.hits) ? data.hits : [];
      const products = hits
        .map((p: Record<string, unknown>, idx: number) => normalizeProduct(p, idx))
        .filter((item: FoodItem | null): item is FoodItem => item !== null);
      return NextResponse.json({ products });
    }
  } catch {
    // Fallback vers cgi/search.pl ci-dessous
  }

  // 2. Fallback classique Open Food Facts
  try {
    const legacyUrl = new URL("https://world.openfoodfacts.org/cgi/search.pl");
    legacyUrl.searchParams.set("search_terms", q);
    legacyUrl.searchParams.set("search_simple", "1");
    legacyUrl.searchParams.set("action", "process");
    legacyUrl.searchParams.set("json", "1");
    legacyUrl.searchParams.set("page_size", "12");
    legacyUrl.searchParams.set(
      "fields",
      "code,product_name,product_name_fr,brands,serving_quantity,serving_size,nutriments"
    );

    const res = await fetch(legacyUrl.toString(), {
      headers,
      signal: AbortSignal.timeout(7000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Open Food Facts indisponible pour le moment.", products: [] },
        { status: 502 }
      );
    }

    const data = await res.json();
    const rawProducts = Array.isArray(data.products) ? data.products : [];
    const products = rawProducts
      .map((p: Record<string, unknown>, idx: number) => normalizeProduct(p, idx))
      .filter((item: FoodItem | null): item is FoodItem => item !== null);

    return NextResponse.json({ products });
  } catch {
    return NextResponse.json(
      { error: "Délai dépassé lors de la recherche Open Food Facts.", products: [] },
      { status: 504 }
    );
  }
}
