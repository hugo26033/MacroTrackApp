interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface CallGeminiOptions {
  parts: GeminiPart[];
  temperature?: number;
  timeoutMs?: number;
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

let cachedDiscoveredModels: { models: string[]; fetchedAt: number } | null = null;

function cleanJsonText(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

async function discoverAvailableModels(apiKey: string): Promise<string[]> {
  if (cachedDiscoveredModels && Date.now() - cachedDiscoveredModels.fetchedAt < 10 * 60_000) {
    return cachedDiscoveredModels.models;
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=50&key=${encodeURIComponent(
        apiKey
      )}`,
      { signal: AbortSignal.timeout(3500) }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
    };
    const ids = (data.models ?? [])
      .filter(
        (m) =>
          m.name &&
          m.name.includes("gemini") &&
          !m.name.includes("embedding") &&
          !m.name.includes("tts") &&
          !m.name.includes("imagen") &&
          m.supportedGenerationMethods?.includes("generateContent")
      )
      .map((m) => m.name!.replace(/^models\//, ""))
      .sort((a, b) => {
        const score = (id: string) =>
          id.includes("hydrogen")
            ? 0
            : id.includes("flash")
              ? 1
              : id.includes("argon")
                ? 2
                : id.includes("carbon")
                  ? 3
                  : 4;
        return score(a) - score(b);
      });

    cachedDiscoveredModels = { models: ids, fetchedAt: Date.now() };
    return ids;
  } catch {
    return [];
  }
}

async function trySingleModel<T>(
  apiKey: string,
  model: string,
  parts: GeminiPart[],
  temperature: number,
  timeoutMs: number
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      }
    );

    if (res.ok) {
      const json = await res.json();
      const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        return { ok: false, status: 502, error: `Réponse vide (${model}).` };
      }
      return { ok: true, data: JSON.parse(cleanJsonText(rawText)) as T };
    }

    const errText = await res.text();
    return {
      ok: false,
      status: res.status,
      error: `Erreur Gemini (${model}, ${res.status}) : ${errText.slice(0, 160)}`,
    };
  } catch (err) {
    return {
      ok: false,
      status: 504,
      error: err instanceof Error ? err.message : `Timeout (${model}).`,
    };
  }
}

export async function callGeminiJSON<T>({
  parts,
  temperature = 0.2,
  timeoutMs = 6500,
}: CallGeminiOptions): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Clé GEMINI_API_KEY manquante côté serveur.");
  }

  const envModel = process.env.GEMINI_MODEL?.trim();
  const primary =
    envModel && envModel !== "gemini-2.5-flash" ? envModel : "gemini-4-hydrogen";
  const staticModels = Array.from(
    new Set([primary, "gemini-3.8-flash", "gemini-4-argon", "gemini-4-carbon"])
  );

  const tried = new Set<string>();
  let lastError = "Erreur API Gemini.";

  for (const model of staticModels) {
    tried.add(model);
    const result = await trySingleModel<T>(apiKey, model, parts, temperature, timeoutMs);
    if (result.ok) return result.data;
    lastError = result.error;

    if (!RETRYABLE_STATUSES.has(result.status) && result.status !== 404 && result.status !== 400) {
      throw new Error(lastError);
    }
  }

  // Découverte dynamique des modèles actifs sur la clé API si tous les modèles statiques ont échoué
  const discovered = await discoverAvailableModels(apiKey);
  for (const model of discovered.slice(0, 4)) {
    if (tried.has(model)) continue;
    tried.add(model);
    const result = await trySingleModel<T>(apiKey, model, parts, temperature, timeoutMs);
    if (result.ok) return result.data;
    lastError = result.error;
  }

  throw new Error(lastError);
}
