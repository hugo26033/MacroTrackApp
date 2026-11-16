import { NextRequest, NextResponse } from "next/server";
import type { FoodItem, MicronutrientKey } from "@/lib/types";

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

function slugifyBrand(brand: string): string {
  return brand
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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

function scoreAndSortProducts(
  items: FoodItem[],
  nameTokens: string[],
  brandTokens: string[]
): FoodItem[] {
  const scored = items.map((item) => {
    const normName = normalizeText(item.name);
    const normBrand = normalizeText(item.brand ?? "");
    const combined = `${normName} ${normBrand}`.trim();

    let nameHits = 0;
    for (const t of nameTokens) {
      if (normName.includes(t)) nameHits += 1;
    }

    let brandHits = 0;
    for (const t of brandTokens) {
      if (normBrand.includes(t)) brandHits += 1;
    }

    const allNameMatch = nameTokens.length > 0 && nameHits === nameTokens.length;
    const allBrandMatch = brandTokens.length === 0 || brandHits === brandTokens.length;
    const allCombinedMatch =
      nameTokens.length + brandTokens.length > 0 &&
      [...nameTokens, ...brandTokens].every((t) => combined.includes(t));

    let score = nameHits * 10 + brandHits * 6;
    if (allNameMatch) score += 25;
    if (allNameMatch && allBrandMatch) score += 30;
    if (allCombinedMatch) score += 15;
    // Slight penalty for empty nutrition
    if (item.per100g.kcal === 0 && item.per100g.proteinG === 0 && item.per100g.carbsG === 0) {
      score -= 2;
    }

    return { item, score, nameHits };
  });

  // If at least one item matches a name token, drop completely unrelated brand-only noise
  const hasNameMatches = scored.some((s) => s.nameHits > 0);
  const filtered = hasNameMatches ? scored.filter((s) => s.nameHits > 0) : scored;

  filtered.sort((a, b) => b.score - a.score);
  return filtered.slice(0, 15).map((s) => s.item);
}

async function querySearchALicious(
  q: string,
  brandSlug: string | null,
  headers: Record<string, string>
): Promise<FoodItem[]> {
  const searchUrl = new URL("https://search.openfoodfacts.org/search");
  const fullQuery = brandSlug ? `${q} brands_tags:${brandSlug}`.trim() : q;
  searchUrl.searchParams.set("q", fullQuery);
  searchUrl.searchParams.set("langs", "fr");
  searchUrl.searchParams.set("page_size", "30");
  searchUrl.searchParams.set(
    "fields",
    "code,product_name,product_name_fr,brands,serving_quantity,serving_size,nutriments"
  );

  const res = await fetch(searchUrl.toString(), {
    headers,
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) {
    throw new Error(`Search-a-licious HTTP ${res.status}`);
  }
  const data = await res.json();
  const hits = Array.isArray(data.hits) ? data.hits : [];
  return hits
    .map((p: Record<string, unknown>, idx: number) => normalizeProduct(p, idx))
    .filter((item: FoodItem | null): item is FoodItem => item !== null);
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const brand = req.nextUrl.searchParams.get("brand")?.trim() ?? "";

  if (q.length < 2 && brand.length < 2) {
    return NextResponse.json({ products: [] });
  }

  const headers = {
    "User-Agent": "MacroPulse-PWA/1.0 (https://github.com/hugo26033/MacroTrackApp)",
  };

  const nameTokens = normalizeText(q).split(" ").filter((t) => t.length >= 2);
  const brandTokens = normalizeText(brand).split(" ").filter((t) => t.length >= 2);
  const brandSlug = brand ? slugifyBrand(brand) : null;

  // 1. Moteur rapide Search-a-licious Open Food Facts
  try {
    let items = await querySearchALicious(q, brandSlug, headers);

    // Si la marque a été tapée dans la description (ex: "fromage blanc carrefour")
    // et que Search-a-licious n'a retourné que des produits d'une marque sans rapport,
    // on tente le dernier mot (ou le premier) comme filtre brands_tags.
    if (!brandSlug && nameTokens.length >= 2) {
      const firstPassMatches = items.filter((item) => {
        const normName = normalizeText(item.name);
        return nameTokens.slice(0, -1).every((t) => normName.includes(t));
      });

      if (firstPassMatches.length === 0) {
        const rawTokens = q.split(/\s+/).filter(Boolean);
        const candidateBrand = rawTokens[rawTokens.length - 1];
        const candidateQuery = rawTokens.slice(0, -1).join(" ");
        const candidateBrandSlug = slugifyBrand(candidateBrand);

        if (candidateQuery.length >= 2 && candidateBrandSlug.length >= 2) {
          const targeted = await querySearchALicious(
            candidateQuery,
            candidateBrandSlug,
            headers
          );
          if (targeted.length > 0) {
            const targetedNameTokens = normalizeText(candidateQuery)
              .split(" ")
              .filter((t) => t.length >= 2);
            const targetedBrandTokens = normalizeText(candidateBrand)
              .split(" ")
              .filter((t) => t.length >= 2);
            return NextResponse.json({
              products: scoreAndSortProducts(targeted, targetedNameTokens, targetedBrandTokens),
            });
          }
        }
      }
    }

    // Si brandSlug est précisé mais trop strict (0 résultat), relancer sans brands_tags et scorer
    if (brandSlug && items.length === 0 && q.length >= 2) {
      items = await querySearchALicious(q, null, headers);
    }

    return NextResponse.json({
      products: scoreAndSortProducts(items, nameTokens, brandTokens),
    });
  } catch {
    // Fallback vers cgi/search.pl ci-dessous
  }

  // 2. Fallback classique Open Food Facts
  try {
    const legacyUrl = new URL("https://world.openfoodfacts.org/cgi/search.pl");
    legacyUrl.searchParams.set("search_terms", [q, brand].filter(Boolean).join(" "));
    legacyUrl.searchParams.set("search_simple", "1");
    legacyUrl.searchParams.set("action", "process");
    legacyUrl.searchParams.set("json", "1");
    legacyUrl.searchParams.set("sort_by", "unique_scans_n");
    legacyUrl.searchParams.set("page_size", "20");
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

    return NextResponse.json({
      products: scoreAndSortProducts(products, nameTokens, brandTokens),
    });
  } catch {
    return NextResponse.json(
      { error: "Délai dépassé lors de la recherche Open Food Facts.", products: [] },
      { status: 504 }
    );
  }
}
