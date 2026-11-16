import { NextRequest, NextResponse } from "next/server";

interface ReadBarcodeRequest {
  imageBase64?: string;
  mimeType?: string;
}

const PROMPT = `Lis le code-barres visible sur cette image (EAN-13, EAN-8, UPC-A, UPC-E ou Code-128) et extrais uniquement ses chiffres.
Réponds STRICTEMENT en JSON valide :
{ "barcode": "3017620422003" }
Si aucun code-barres ou numéro lisible n'est présent, réponds :
{ "barcode": null }`;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ReadBarcodeRequest;
    const imageBase64 = body.imageBase64?.trim();
    const mimeType = body.mimeType || "image/jpeg";

    if (!imageBase64) {
      return NextResponse.json(
        { error: "Aucune image fournie." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Clé GEMINI_API_KEY manquante dans .env.local." },
        { status: 503 }
      );
    }

    const model = process.env.GEMINI_MODEL || "gemini-4-hydrogen";
    const cleaned = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: PROMPT },
                { inlineData: { mimeType, data: cleaned } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return NextResponse.json(
        { error: `Erreur API Gemini (${geminiRes.status}) : ${errText.slice(0, 180)}` },
        { status: 502 }
      );
    }

    const geminiJson = await geminiRes.json();
    const rawText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return NextResponse.json({ error: "Réponse vide de Gemini." }, { status: 502 });
    }

    const parsed = JSON.parse(rawText) as { barcode?: string | null };
    const digits = parsed.barcode ? String(parsed.barcode).replace(/\D/g, "") : "";

    if (!digits || digits.length < 6) {
      return NextResponse.json(
        { error: "Aucun code-barres lisible détecté sur la photo." },
        { status: 404 }
      );
    }

    return NextResponse.json({ barcode: digits });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Erreur lecture code-barres : ${err.message}`
            : "Erreur inconnue.",
      },
      { status: 500 }
    );
  }
}
