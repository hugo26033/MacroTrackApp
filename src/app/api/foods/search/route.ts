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

/**
 * Search-a-licious no longer indexes the `nutriments` object, but it does
 * expose the energy computed for the Nutri-Score, which is enough to avoid
 * displaying "0 kcal" while the full product data is being fetched.
 */
function kcalFromNutriscore(p: Record<string, unknown>): number {
  const data = p.nutriscore_data;
  if (!data || typeof data !== "object") return 0;

  const components = (data as Record<string, unknown>).components;
  if (!components || typeof components !== "object") return 0;

  const negative = (components as Record<string, unknown>).negative;
  if (!Array.isArray(negative)) return 0;

  for (const component of negative) {
    if (!component || typeof component !== "object") continue;
    const entry = component as Record<string, unknown>;
    if (entry.id !== "energy") continue;
    const value = Number(entry.value);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.round(entry.unit === "kcal" ? value : value / 4.184);
  }
  return 0;
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
    kcalFromNutriscore(p) ||
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

const DETAIL_FIELDS =
  "code,product_name,product_name_fr,brands,serving_quantity,serving_size,nutriments";
const PRODUCT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const productDetailsCache = new Map<string, { item: FoodItem; expiresAt: number }>();

function hasNutritionData(item: FoodItem): boolean {
  const { kcal, proteinG, carbsG, fatG } = item.per100g;
  return kcal > 0 || proteinG > 0 || carbsG > 0 || fatG > 0;
}

/**
 * The search index only carries the Nutri-Score energy, so macros are missing
 * from search results. Fetch the complete product data for every result that
 * needs it, in a single bulk request.
 */
function needsProductDetails(item: FoodItem): boolean {
  if (!item.barcode) return false;
  const { kcal, proteinG, carbsG, fatG } = item.per100g;
  return kcal === 0 || (proteinG === 0 && carbsG === 0 && fatG === 0);
}

async function fetchProductDetails(
  codes: string[],
  headers: Record<string, string>
): Promise<Map<string, FoodItem>> {
  const details = new Map<string, FoodItem>();
  const missing: string[] = [];
  const now = Date.now();

  for (const code of codes) {
    const cached = productDetailsCache.get(code);
    if (cached && cached.expiresAt > now) {
      details.set(code, cached.item);
    } else {
      missing.push(code);
    }
  }

  if (missing.length === 0) return details;

  const url = new URL("https://world.openfoodfacts.org/api/v2/search");
  url.searchParams.set("code", missing.join(","));
  url.searchParams.set("fields", DETAIL_FIELDS);
  url.searchParams.set("page_size", String(Math.max(20, missing.length)));

  // The OFF search endpoint (used with a `code` filter for bulk product reads)
  // occasionally answers 503 under load: retry a couple of times.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) continue;

      const data = (await res.json()) as { products?: unknown };
      const rawProducts = Array.isArray(data.products) ? data.products : [];
      let found = 0;

      for (const raw of rawProducts) {
        if (!raw || typeof raw !== "object") continue;
        const product = raw as Record<string, unknown>;
        const code = product.code ? String(product.code) : "";
        if (!code || !missing.includes(code)) continue;

        const item = normalizeProduct(product, 0);
        if (!item) continue;

        details.set(code, item);
        productDetailsCache.set(code, {
          item,
          expiresAt: Date.now() + PRODUCT_CACHE_TTL_MS,
        });
        found += 1;
      }

      if (found > 0) break;
    } catch {
      // Network error or timeout: retry below.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return details;
}

async function enrichProducts(
  items: FoodItem[],
  headers: Record<string, string>
): Promise<FoodItem[]> {
  const codes = [
    ...new Set(items.filter(needsProductDetails).map((item) => item.barcode)),
  ].filter((code): code is string => Boolean(code));

  if (codes.length === 0) return items;

  const details = await fetchProductDetails(codes, headers);

  return items.map((item) => {
    const detail = item.barcode ? details.get(item.barcode) : undefined;
    if (!detail) return item;

    return {
      ...item,
      name: detail.name || item.name,
      brand: detail.brand || item.brand,
      servingSizeG: detail.servingSizeG || item.servingSizeG,
      servingLabel: detail.servingLabel || item.servingLabel,
      per100g: hasNutritionData(detail)
        ? {
            kcal: detail.per100g.kcal || item.per100g.kcal,
            proteinG: detail.per100g.proteinG,
            carbsG: detail.per100g.carbsG,
            fatG: detail.per100g.fatG,
            micronutrients: {
              ...item.per100g.micronutrients,
              ...detail.per100g.micronutrients,
            },
          }
        : item.per100g,
    };
  });
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
    "code,product_name,product_name_fr,brands,serving_quantity,serving_size,nutriments,nutriscore_data"
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
              products: await enrichProducts(
                scoreAndSortProducts(targeted, targetedNameTokens, targetedBrandTokens),
                headers
              ),
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
      products: await enrichProducts(scoreAndSortProducts(items, nameTokens, brandTokens), headers),
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
