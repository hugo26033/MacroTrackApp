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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanJsonText(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export async function callGeminiJSON<T>({
  parts,
  temperature = 0.2,
  timeoutMs = 18000,
}: CallGeminiOptions): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Clé GEMINI_API_KEY manquante côté serveur.");
  }

  const primary = process.env.GEMINI_MODEL?.trim() || "gemini-4-hydrogen";
  const models = Array.from(
    new Set([primary, "gemini-3.8-flash", "gemini-2.5-flash"])
  );

  let lastError = "Erreur API Gemini.";

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
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
            lastError = "Réponse vide reçue de Gemini.";
            continue;
          }
          return JSON.parse(cleanJsonText(rawText)) as T;
        }

        const errText = await res.text();
        lastError = `Erreur Gemini (${res.status}) : ${errText.slice(0, 160)}`;

        // Modèle indisponible ou introuvable -> passer directement au modèle fallback suivant
        if (res.status === 404 || res.status === 400) {
          break;
        }

        if (RETRYABLE_STATUSES.has(res.status) && attempt === 0) {
          await sleep(600);
          continue;
        }

        // Si toujours 429/503 après retry, tenter le modèle fallback suivant
        if (RETRYABLE_STATUSES.has(res.status)) {
          break;
        }
      } catch (err) {
        lastError =
          err instanceof Error ? err.message : "Délai dépassé lors de l'appel Gemini.";
        if (attempt === 0) {
          await sleep(500);
          continue;
        }
      }
    }
  }

  throw new Error(lastError);
}
