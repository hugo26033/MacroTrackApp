import { NextRequest, NextResponse } from "next/server";
import { callGeminiJSON } from "@/lib/gemini";
import type { GeminiDetectedFood } from "@/lib/types";

export const maxDuration = 30;

interface AnalyzeRequest {
  text?: string;
  imageBase64?: string;
  mimeType?: string;
}

const SYSTEM_PROMPT = `Tu es un nutritionniste expert. Analyse le repas décrit (texte et/ou photo) et décompose-le en aliments individuels réalistes.
Réponds STRICTEMENT en JSON valide respectant ce schéma :
{
  "items": [
    {
      "name": "Nom de l'aliment en français",
      "estimatedGrams": 150,
      "kcal": 240,
      "proteinG": 31,
      "carbsG": 0,
      "fatG": 12,
      "fiberG": 0,
      "sugarG": 0,
      "saturatedFatG": 3.2,
      "sodiumMg": 90,
      "confidence": "high"
    }
  ]
}
Estime les portions en grammes de façon réaliste. Ne mets aucun texte hors du JSON.`;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AnalyzeRequest;
    const text = body.text?.trim();
    const imageBase64 = body.imageBase64?.trim();
    const mimeType = body.mimeType || "image/jpeg";

    if (!text && !imageBase64) {
      return NextResponse.json(
        { error: "Fournis une description texte ou une photo du repas." },
        { status: 400 }
      );
    }

    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
      {
        text: text
          ? `${SYSTEM_PROMPT}\n\nDescription du repas par l'utilisateur : "${text}"`
          : `${SYSTEM_PROMPT}\n\nAnalyse cette photo de repas et estime chaque aliment visible.`,
      },
    ];

    if (imageBase64) {
      const cleaned = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      parts.push({
        inlineData: {
          mimeType,
          data: cleaned,
        },
      });
    }

    const parsed = await callGeminiJSON<{ items?: GeminiDetectedFood[] }>({
      parts,
      temperature: 0.2,
    });

    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Erreur d'analyse Gemini : ${err.message}`
            : "Erreur inconnue lors de l'analyse.",
      },
      { status: 502 }
    );
  }
}
