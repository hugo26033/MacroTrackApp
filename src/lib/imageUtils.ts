/**
 * Redimensionne et compresse une image côté client (via canvas) pour éviter
 * les payloads Base64 de 5-10 Mo sur iPhone/Android et accélérer Gemini.
 */
export async function compressImageFile(
  file: File,
  maxDim = 1024,
  quality = 0.82
): Promise<{ dataUrl: string; mimeType: string }> {
  const fallbackRead = () =>
    new Promise<{ dataUrl: string; mimeType: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve({ dataUrl: String(reader.result), mimeType: file.type || "image/jpeg" });
      reader.onerror = () => reject(new Error("Impossible de lire l'image."));
      reader.readAsDataURL(file);
    });

  if (typeof document === "undefined") {
    return fallbackRead();
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return fallbackRead();
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    return { dataUrl, mimeType: "image/jpeg" };
  } catch {
    return fallbackRead();
  }
}
