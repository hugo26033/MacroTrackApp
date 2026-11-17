import { NextRequest, NextResponse } from "next/server";
import { callGeminiJSON } from "@/lib/gemini";

export const maxDuration = 30;

interface ReadBarcodeRequest {
  imageBase64?: string;
  mimeType?: string;
}

const PROMPT = `Lis le code-barres visible sur cette image (EAN-13, EAN-8, UPC-A, UPC-E ou Code-128) et les chiffres imprimés juste en dessous des barres.
Extrais uniquement les chiffres du code-barres, sans espace.
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

    const cleaned = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const parsed = await callGeminiJSON<{ barcode?: string | null }>({
      parts: [
        { text: PROMPT },
        { inlineData: { mimeType, data: cleaned } },
      ],
      temperature: 0,
    });

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
      { status: 502 }
    );
  }
}
