"use client";

import React, { useEffect, useRef, useState } from "react";
import { scaleNutrients, sumNutrients } from "@/lib/calculations";
import { compressImageFile } from "@/lib/imageUtils";
import {
  MICRONUTRIENT_CATALOG,
  type FoodItem,
  type FoodLogEntry,
  type GeminiDetectedFood,
  type MealSlot,
  type NutrientValues,
  type Recipe,
  type RecipeItem,
} from "@/lib/types";
import {
  BarcodeIcon,
  CameraIcon,
  ChevronDownIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  TrashIcon,
  XIcon,
} from "./Icons";
import { NumberInput } from "./NumberInput";

export type QuickAddTabMode = "all" | "recipes" | "foods" | "barcode" | "photo" | "text" | "manual";

interface QuickAddModalProps {
  open: boolean;
  onClose: () => void;
  selectedDate: string;
  foods: FoodItem[];
  recipes: Recipe[];
  foodLogs?: FoodLogEntry[];
  initialTab?: QuickAddTabMode;
  initialMealSlot?: MealSlot;
  onAddFoodLogs: (logs: Omit<FoodLogEntry, "id">[]) => void;
  onSaveCustomFood: (food: FoodItem) => void;
  onSaveRecipe?: (recipe: Recipe) => void;
  onDeleteRecipe?: (id: string) => void;
}

const MEAL_SLOTS: { value: MealSlot; label: string }[] = [
  { value: "breakfast", label: "Petit déjeuner" },
  { value: "lunch", label: "Déjeuner" },
  { value: "dinner", label: "Dîner" },
  { value: "snack", label: "Snacks" },
];

export function QuickAddModal({
  open,
  onClose,
  selectedDate,
  foods,
  recipes,
  foodLogs = [],
  initialTab = "all",
  initialMealSlot = "lunch",
  onAddFoodLogs,
  onSaveCustomFood,
  onSaveRecipe,
  onDeleteRecipe,
}: QuickAddModalProps) {
  const [tab, setTab] = useState<QuickAddTabMode>(initialTab);
  const [mealSlot, setMealSlot] = useState<MealSlot>(initialMealSlot);
  const [searchQuery, setSearchQuery] = useState("");
  const [brandQuery, setBrandQuery] = useState("");
  const [offResults, setOffResults] = useState<FoodItem[]>([]);
  const [offLoading, setOffLoading] = useState(false);
  const [offError, setOffError] = useState<string | null>(null);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [selectedQtyMode, setSelectedQtyMode] = useState<"grams" | "unit">("grams");
  const [selectedFoodQtyG, setSelectedFoodQtyG] = useState<number>(100);
  const [selectedUnitCount, setSelectedUnitCount] = useState<number>(1);
  const [selectedUnitWeightG, setSelectedUnitWeightG] = useState<number>(100);

  // Barcode state
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodePhotoPreview, setBarcodePhotoPreview] = useState<string | null>(null);
  const [scanningCamera, setScanningCamera] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [foundProduct, setFoundProduct] = useState<FoodItem | null>(null);
  const [productQtyG, setProductQtyG] = useState<number>(100);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  // Gemini AI state
  const [aiText, setAiText] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoMime, setPhotoMime] = useState<string>("image/jpeg");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiItems, setAiItems] = useState<GeminiDetectedFood[]>([]);

  // Manual food creation state
  const [manualName, setManualName] = useState("");
  const [manualSavedMsg, setManualSavedMsg] = useState<string | null>(null);
  const [manualUnitType, setManualUnitType] = useState<"grams" | "unit">("grams");
  const [manualUnitLabel, setManualUnitLabel] = useState("unité");
  const [manualUnitCount, setManualUnitCount] = useState(1);
  const [manualQty, setManualQty] = useState(100);
  const [manualKcal, setManualKcal] = useState(200);
  const [manualP, setManualP] = useState(15);
  const [manualC, setManualC] = useState(20);
  const [manualF, setManualF] = useState(6);
  const [manualFiber, setManualFiber] = useState(2);

  // Recipe creation & adjustment state
  const [creatingRecipe, setCreatingRecipe] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [recipeName, setRecipeName] = useState("");
  const [recipeServings, setRecipeServings] = useState(1);
  const [recipeDraftItems, setRecipeDraftItems] = useState<RecipeItem[]>([]);
  const [recipeIngSearch, setRecipeIngSearch] = useState("");
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [adjustedRecipeItems, setAdjustedRecipeItems] = useState<RecipeItem[]>([]);
  const [recipePortionsToLog, setRecipePortionsToLog] = useState(1);

  useEffect(() => {
    const q = searchQuery.trim();
    const brand = brandQuery.trim();
    if ((q.length < 2 && brand.length < 2) || (tab !== "all" && tab !== "foods")) {
      setOffResults([]);
      setOffError(null);
      setOffLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setOffLoading(true);
      setOffError(null);
      try {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (brand) params.set("brand", brand);
        const res = await fetch(`/api/foods/search?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) {
          setOffError(data.error || "Erreur Open Food Facts.");
          setOffResults([]);
        } else {
          setOffResults(Array.isArray(data.products) ? data.products : []);
        }
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") {
          setOffError("Impossible de contacter Open Food Facts.");
        }
      } finally {
        setOffLoading(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, brandQuery, tab]);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setMealSlot(initialMealSlot);
      setSearchQuery("");
      setBrandQuery("");
      setSelectedFood(null);
      setCreatingRecipe(false);
      setSelectedRecipe(null);
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [open, initialTab, initialMealSlot]);

  useEffect(() => {
    if (scanningCamera && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [scanningCamera]);

  function stopCamera() {
    if (scanTimerRef.current !== null) {
      window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScanningCamera(false);
  }

  async function getBarcodeDetector() {
    type DetectorInstance = {
      detect: (
        src: HTMLVideoElement | ImageBitmap | HTMLCanvasElement
      ) => Promise<Array<{ rawValue: string }>>;
    };
    type DetectorCtor = new (opts: {
      formats: Array<"ean_13" | "ean_8" | "upc_a" | "upc_e" | "code_128">;
    }) => DetectorInstance;

    let BarcodeDetectorCtor = (
      window as unknown as { BarcodeDetector?: DetectorCtor }
    ).BarcodeDetector;

    if (!BarcodeDetectorCtor) {
      const mod = await import("barcode-detector/ponyfill");
      if (typeof mod.prepareZXingModule === "function") {
        mod.prepareZXingModule({
          overrides: {
            locateFile: (path: string, prefix: string) =>
              path.endsWith(".wasm") ? "/wasm/zxing_reader.wasm" : `${prefix}${path}`,
          },
        });
      }
      BarcodeDetectorCtor = mod.BarcodeDetector as unknown as DetectorCtor;
    }

    return new BarcodeDetectorCtor({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
    });
  }

  /**
   * Downscale large camera photos (e.g. 12-48 MP on iPhone) before passing
   * them to the barcode detector so WASM decoding stays fast and within memory limits.
   */
  async function decodeBarcodeFromFile(file: File): Promise<string | null> {
    const detector = await getBarcodeDetector();
    const bitmap = await createImageBitmap(file);
    try {
      const maxSide = 1600;
      const largest = Math.max(bitmap.width, bitmap.height);
      if (largest > maxSide) {
        const scale = maxSide / largest;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const codes = await detector.detect(canvas);
          return codes[0]?.rawValue ?? null;
        }
      }
      const codes = await detector.detect(bitmap);
      return codes[0]?.rawValue ?? null;
    } finally {
      bitmap.close?.();
    }
  }

  async function handleBarcodePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setBarcodeError(null);
    setFoundProduct(null);
    setBarcodeLoading(true);

    try {
      const { dataUrl, mimeType } = await compressImageFile(file, 1280, 0.85);
      setBarcodePhotoPreview(dataUrl);

      // 1. Essai local instantané (ZXing WASM / BarcodeDetector natif, 0 quota Gemini)
      try {
        const detector = await getBarcodeDetector();
        const bitmap = await createImageBitmap(file);
        const codes = await detector.detect(bitmap);
        bitmap.close?.();
        if (codes.length > 0 && codes[0].rawValue) {
          const code = codes[0].rawValue;
          setBarcodeInput(code);
          await lookupBarcode(code);
          return;
        }
      } catch {
        // Fallback vers Gemini ci-dessous
      }

      // 2. Fallback Gemini (image compressée ~120 Ko + retry/fallback serveur)
      const res = await fetch("/api/ai/read-barcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: dataUrl, mimeType }),
      });
      const data = await res.json();
      if (!res.ok || !data.barcode) {
        setBarcodeError(data.error || "Code-barres illisible sur la photo.");
        setBarcodeLoading(false);
        return;
      }
      setBarcodeInput(data.barcode);
      await lookupBarcode(data.barcode);
    } catch {
      setBarcodeError("Impossible de lire le code-barres.");
      setBarcodeLoading(false);
    } finally {
      input.value = "";
    }
  }

  function formatCameraError(err: unknown): string {
    if (err instanceof DOMException || err instanceof Error) {
      const name = err.name;
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        return "Accès caméra refusé. Sur Safari iOS, vérifie Réglages > Safari > Caméra (ou le menu aA de la barre d'adresse), ou utilise « Photo code-barres ».";
      }
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        return "Aucune caméra détectée sur cet appareil. Utilise « Photo code-barres ».";
      }
      if (name === "NotReadableError" || name === "TrackStartError") {
        return "Caméra déjà utilisée par une autre application. Ferme-la ou utilise « Photo code-barres ».";
      }
      return `Caméra en direct : ${err.message}. Essaie « Photo code-barres ».`;
    }
    return "Permission caméra refusée ou indisponible. Utilise « Photo code-barres ».";
  }

  async function startCameraScan() {
    setBarcodeError(null);
    if (!window.isSecureContext) {
      setBarcodeError(
        "La caméra en direct nécessite une connexion HTTPS sur Safari iOS. Utilise « Photo code-barres » à la place."
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setBarcodeError(
        "Caméra en direct indisponible sur ce navigateur. Utilise « Photo code-barres » ou saisis les chiffres."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      setScanningCamera(true);

      const detector = await getBarcodeDetector();

      const tick = async () => {
        if (!streamRef.current) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          try {
            const codes = await detector.detect(video);
            if (codes.length > 0 && codes[0].rawValue) {
              const code = codes[0].rawValue;
              setBarcodeInput(code);
              stopCamera();
              await lookupBarcode(code);
              return;
            }
          } catch {
            // ignore frame detection errors
          }
        }
        if (streamRef.current) {
          scanTimerRef.current = window.setTimeout(() => requestAnimationFrame(tick), 150);
        }
      };
      scanTimerRef.current = window.setTimeout(() => requestAnimationFrame(tick), 250);
    } catch (err) {
      stopCamera();
      setBarcodeError(formatCameraError(err));
    }
  }

  async function lookupBarcode(codeToFetch?: string) {
    const code = (codeToFetch ?? barcodeInput).trim();
    if (!code) return;
    setBarcodeLoading(true);
    setBarcodeError(null);
    setFoundProduct(null);
    try {
      const res = await fetch(`/api/barcode?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) {
        setBarcodeError(data.error || "Produit introuvable.");
      } else {
        setFoundProduct(data.product);
        const lastLog = getLastLoggedForFood(data.product);
        setProductQtyG(lastLog?.quantityG ?? (data.product.servingSizeG || 100));
      }
    } catch {
      setBarcodeError("Erreur réseau lors de la recherche.");
    } finally {
      setBarcodeLoading(false);
    }
  }

  function handleConfirmBarcode() {
    if (!foundProduct) return;
    const nutrients = scaleNutrients(foundProduct.per100g, productQtyG);
    onSaveCustomFood(foundProduct);
    onAddFoodLogs([
      {
        logDate: selectedDate,
        loggedAt: new Date().toISOString(),
        mealSlot,
        foodName: foundProduct.name,
        brand: foundProduct.brand,
        barcode: foundProduct.barcode,
        quantityG: productQtyG,
        nutrients,
        source: "barcode",
      },
    ]);
    onClose();
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const { dataUrl, mimeType } = await compressImageFile(file, 1024, 0.82);
      setPhotoMime(mimeType);
      setPhotoPreview(dataUrl);
    } finally {
      input.value = "";
    }
  }

  async function runGeminiAnalysis(mode: "photo" | "text") {
    setAiLoading(true);
    setAiError(null);
    setAiItems([]);
    try {
      const res = await fetch("/api/ai/analyze-meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: aiText.trim() || undefined,
          imageBase64: mode === "photo" ? photoPreview ?? undefined : undefined,
          mimeType: photoMime,
        }),
      });
      const rawBody = await res.text();
      let data: { error?: string; items?: GeminiDetectedFood[] } = {};
      try {
        data = JSON.parse(rawBody);
      } catch {
        // Réponse non-JSON (ex: 504 Timeout Vercel)
      }
      if (!res.ok) {
        setAiError(
          data.error || `Erreur serveur (${res.status}). Réessaie ou précise le texte.`
        );
      } else {
        setAiItems(data.items ?? []);
      }
    } catch (err) {
      setAiError(
        err instanceof Error
          ? `Erreur réseau : ${err.message}`
          : "Impossible de contacter l'API Gemini."
      );
    } finally {
      setAiLoading(false);
    }
  }

  function updateAiItem(idx: number, patch: Partial<GeminiDetectedFood>) {
    setAiItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  }

  function handleConfirmAiItems() {
    if (aiItems.length === 0) return;
    const nowIso = new Date().toISOString();
    const source = tab === "photo" ? "gemini_photo" : "gemini_text";
    onAddFoodLogs(
      aiItems.map((item) => ({
        logDate: selectedDate,
        loggedAt: nowIso,
        mealSlot,
        foodName: item.name,
        quantityG: item.estimatedGrams,
        nutrients: {
          kcal: Math.round(item.kcal),
          proteinG: item.proteinG,
          carbsG: item.carbsG,
          fatG: item.fatG,
          micronutrients: {
            fiber_g: item.fiberG ?? 0,
            sugar_g: item.sugarG ?? 0,
            saturated_fat_g: item.saturatedFatG ?? 0,
            sodium_mg: item.sodiumMg ?? 0,
          },
        },
        source,
      }))
    );
    setAiItems([]);
    setAiText("");
    setPhotoPreview(null);
    onClose();
  }

  function getLastLoggedForFood(food: FoodItem): FoodLogEntry | undefined {
    const targetName = food.name.trim().toLowerCase();
    for (let i = foodLogs.length - 1; i >= 0; i--) {
      const log = foodLogs[i];
      if (food.barcode && log.barcode && log.barcode === food.barcode) {
        return log;
      }
      if (log.foodName.trim().toLowerCase() === targetName) {
        return log;
      }
    }
    return undefined;
  }

  function getLastLoggedForRecipe(recipe: Recipe): FoodLogEntry | undefined {
    const targetName = recipe.name.trim().toLowerCase();
    for (let i = foodLogs.length - 1; i >= 0; i--) {
      const log = foodLogs[i];
      if (log.source === "recipe" && log.foodName.trim().toLowerCase() === targetName) {
        return log;
      }
    }
    return undefined;
  }

  function handleAddSavedFood(food: FoodItem) {
    const lastLog = getLastLoggedForFood(food);
    const qty = lastLog?.quantityG ?? (food.servingSizeG || 100);
    const unitFields =
      lastLog?.unitQuantity !== undefined
        ? {
            unitQuantity: lastLog.unitQuantity,
            unitLabel: lastLog.unitLabel || food.unitLabel || "unité",
            unitWeightG: lastLog.unitWeightG || food.servingSizeG || qty,
          }
        : food.unitType === "unit"
          ? {
              unitQuantity: 1,
              unitLabel: food.unitLabel || "unité",
              unitWeightG: qty,
            }
          : {};

    onAddFoodLogs([
      {
        logDate: selectedDate,
        loggedAt: new Date().toISOString(),
        mealSlot,
        foodName: food.name,
        brand: food.brand,
        barcode: food.barcode,
        quantityG: qty,
        ...unitFields,
        nutrients: scaleNutrients(food.per100g, qty),
        source: "manual",
      },
    ]);
    onClose();
  }

  function computeRecipeTotals(items: RecipeItem[], servings: number): {
    totalG: number;
    total: NutrientValues;
    perServing: NutrientValues;
  } {
    const safeServings = Math.max(1, servings);
    const totalG = Math.round(items.reduce((s, i) => s + i.quantityG, 0) * 10) / 10;
    const total = sumNutrients(items.map((i) => scaleNutrients(i.per100g, i.quantityG)));
    const microsPerServing: NutrientValues["micronutrients"] = {};
    for (const [k, v] of Object.entries(total.micronutrients)) {
      if (typeof v === "number") {
        microsPerServing[k as keyof NutrientValues["micronutrients"]] =
          Math.round((v / safeServings) * 10) / 10;
      }
    }
    const perServing: NutrientValues = {
      kcal: Math.round(total.kcal / safeServings),
      proteinG: Math.round((total.proteinG / safeServings) * 10) / 10,
      carbsG: Math.round((total.carbsG / safeServings) * 10) / 10,
      fatG: Math.round((total.fatG / safeServings) * 10) / 10,
      micronutrients: microsPerServing,
    };
    return { totalG, total, perServing };
  }

  function handleAddRecipe(recipe: Recipe) {
    const servings = Math.max(1, recipe.servings);
    const totalG = recipe.items.reduce((s, i) => s + i.quantityG, 0);
    const onePortionG = Math.max(1, Math.round((totalG / servings) * 10) / 10);
    const consumedItems: RecipeItem[] = recipe.items.map((item) => ({
      ...item,
      quantityG: Math.round((item.quantityG / servings) * 10) / 10,
    }));
    onAddFoodLogs([
      {
        logDate: selectedDate,
        loggedAt: new Date().toISOString(),
        mealSlot,
        foodName: recipe.name,
        quantityG: onePortionG,
        unitQuantity: 1,
        unitLabel: "portion",
        unitWeightG: onePortionG,
        recipeItems: consumedItems,
        nutrients: recipe.perServing,
        source: "recipe",
      },
    ]);
    onClose();
  }

  function openRecipeDetails(recipe: Recipe) {
    const lastLog = getLastLoggedForRecipe(recipe);
    setSelectedRecipe(recipe);
    setAdjustedRecipeItems(recipe.items.map((item) => ({ ...item })));
    setRecipePortionsToLog(lastLog?.unitQuantity ?? 1);
    setCreatingRecipe(false);
  }

  function handleConfirmAdjustedRecipe() {
    if (!selectedRecipe) return;
    const { totalG, perServing } = computeRecipeTotals(
      adjustedRecipeItems,
      selectedRecipe.servings
    );
    const safePortions = Math.max(0.25, recipePortionsToLog);
    const onePortionG = Math.max(1, totalG / Math.max(1, selectedRecipe.servings));
    const loggedG = Math.max(1, Math.round(onePortionG * safePortions * 10) / 10);
    const scaledMicros: NutrientValues["micronutrients"] = {};
    for (const [k, v] of Object.entries(perServing.micronutrients)) {
      if (typeof v === "number") {
        scaledMicros[k as keyof NutrientValues["micronutrients"]] =
          Math.round(v * safePortions * 10) / 10;
      }
    }
    const servings = Math.max(1, selectedRecipe.servings);
    const ratio = safePortions / servings;
    const consumedItems: RecipeItem[] = adjustedRecipeItems.map((item) => ({
      ...item,
      quantityG: Math.round(item.quantityG * ratio * 10) / 10,
    }));
    onAddFoodLogs([
      {
        logDate: selectedDate,
        loggedAt: new Date().toISOString(),
        mealSlot,
        foodName: selectedRecipe.name,
        quantityG: loggedG,
        unitQuantity: safePortions,
        unitLabel: "portion",
        unitWeightG: Math.round(onePortionG * 10) / 10,
        recipeItems: consumedItems,
        nutrients: {
          kcal: Math.round(perServing.kcal * safePortions),
          proteinG: Math.round(perServing.proteinG * safePortions * 10) / 10,
          carbsG: Math.round(perServing.carbsG * safePortions * 10) / 10,
          fatG: Math.round(perServing.fatG * safePortions * 10) / 10,
          micronutrients: scaledMicros,
        },
        source: "recipe",
      },
    ]);
    setSelectedRecipe(null);
    onClose();
  }

  function startEditingRecipe(recipe: Recipe) {
    setEditingRecipeId(recipe.id);
    setRecipeName(recipe.name);
    setRecipeServings(recipe.servings);
    setRecipeDraftItems(recipe.items.map((item) => ({ ...item })));
    setRecipeIngSearch("");
    setSelectedRecipe(null);
    setCreatingRecipe(true);
  }

  function handleSaveNewRecipe(e: React.FormEvent) {
    e.preventDefault();
    if (!recipeName.trim() || recipeDraftItems.length === 0 || !onSaveRecipe) return;
    const { perServing } = computeRecipeTotals(recipeDraftItems, recipeServings);
    const savedRecipe: Recipe = {
      id: editingRecipeId ?? `recipe-${Date.now()}`,
      name: recipeName.trim(),
      servings: Math.max(1, recipeServings),
      items: recipeDraftItems,
      perServing,
    };
    onSaveRecipe(savedRecipe);
    setEditingRecipeId(null);
    setRecipeName("");
    setRecipeServings(1);
    setRecipeDraftItems([]);
    setRecipeIngSearch("");
    setCreatingRecipe(false);
  }

  function buildManualFood(): FoodItem | null {
    if (!manualName.trim()) return null;
    const isUnit = manualUnitType === "unit";
    const baseG = Math.max(1, manualQty);
    const factor = 100 / baseG;
    const cleanUnitLabel = manualUnitLabel.trim() || "unité";

    return {
      id: `custom-${Date.now()}`,
      name: manualName.trim(),
      servingSizeG: baseG,
      servingLabel: isUnit ? `1 ${cleanUnitLabel} (${baseG} g)` : `${baseG} g`,
      unitType: manualUnitType,
      unitLabel: isUnit ? cleanUnitLabel : undefined,
      per100g: {
        kcal: Math.round(manualKcal * factor),
        proteinG: Math.round(manualP * factor * 10) / 10,
        carbsG: Math.round(manualC * factor * 10) / 10,
        fatG: Math.round(manualF * factor * 10) / 10,
        micronutrients: { fiber_g: Math.round(manualFiber * factor * 10) / 10 },
      },
      source: "manual",
    };
  }

  function handleCreateFoodOnly() {
    const customFood = buildManualFood();
    if (!customFood) return;
    onSaveCustomFood(customFood);
    setManualSavedMsg(`« ${customFood.name} » enregistré dans Mes aliments.`);
    setManualName("");
  }

  function handleAddManualCustom(e: React.FormEvent) {
    e.preventDefault();
    const customFood = buildManualFood();
    if (!customFood) return;
    const isUnit = manualUnitType === "unit";
    const baseG = Math.max(1, manualQty);
    const cleanUnitLabel = manualUnitLabel.trim() || "unité";
    const count = isUnit ? Math.max(0.25, manualUnitCount) : 1;
    const loggedG = Math.round(baseG * count * 10) / 10;

    onSaveCustomFood(customFood);
    onAddFoodLogs([
      {
        logDate: selectedDate,
        loggedAt: new Date().toISOString(),
        mealSlot,
        foodName: customFood.name,
        quantityG: loggedG,
        ...(isUnit
          ? {
              unitQuantity: count,
              unitLabel: cleanUnitLabel,
              unitWeightG: baseG,
            }
          : {}),
        nutrients: {
          kcal: Math.round(manualKcal * count),
          proteinG: Math.round(manualP * count * 10) / 10,
          carbsG: Math.round(manualC * count * 10) / 10,
          fatG: Math.round(manualF * count * 10) / 10,
          micronutrients: { fiber_g: Math.round(manualFiber * count * 10) / 10 },
        },
        source: "manual",
      },
    ]);
    setManualName("");
    setManualUnitCount(1);
    onClose();
  }

  function openFoodDetails(food: FoodItem) {
    const lastLog = getLastLoggedForFood(food);
    const defaultWeight = food.servingSizeG || 100;
    setSelectedFood(food);
    if (lastLog) {
      if (lastLog.unitQuantity !== undefined) {
        setSelectedQtyMode("unit");
        setSelectedUnitCount(lastLog.unitQuantity);
        setSelectedUnitWeightG(lastLog.unitWeightG || defaultWeight);
        setSelectedFoodQtyG(lastLog.quantityG);
      } else {
        setSelectedQtyMode(food.unitType === "unit" ? "unit" : "grams");
        setSelectedFoodQtyG(lastLog.quantityG);
        setSelectedUnitCount(1);
        setSelectedUnitWeightG(defaultWeight);
      }
    } else {
      setSelectedQtyMode(food.unitType === "unit" ? "unit" : "grams");
      setSelectedFoodQtyG(defaultWeight);
      setSelectedUnitCount(1);
      setSelectedUnitWeightG(defaultWeight);
    }
  }

  function handleConfirmSelectedFood() {
    if (!selectedFood) return;
    const isUnit = selectedQtyMode === "unit";
    const effectiveQtyG = isUnit
      ? Math.max(1, Math.round(selectedUnitCount * selectedUnitWeightG * 10) / 10)
      : Math.max(1, selectedFoodQtyG);
    const nutrients = scaleNutrients(selectedFood.per100g, effectiveQtyG);
    onSaveCustomFood(selectedFood);
    onAddFoodLogs([
      {
        logDate: selectedDate,
        loggedAt: new Date().toISOString(),
        mealSlot,
        foodName: selectedFood.name,
        brand: selectedFood.brand,
        barcode: selectedFood.barcode,
        quantityG: effectiveQtyG,
        ...(isUnit
          ? {
              unitQuantity: selectedUnitCount,
              unitLabel: selectedFood.unitLabel || "unité",
              unitWeightG: selectedUnitWeightG,
            }
          : {}),
        nutrients,
        source: selectedFood.barcode ? "barcode" : "manual",
      },
    ]);
    setSelectedFood(null);
    onClose();
  }

  if (!open) return null;

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const normalizedBrand = brandQuery.trim().toLowerCase();
  const filteredFoods = foods.filter((f) => {
    const matchesName =
      !normalizedQuery ||
      f.name.toLowerCase().includes(normalizedQuery) ||
      (!normalizedBrand && Boolean(f.brand && f.brand.toLowerCase().includes(normalizedQuery)));
    const matchesBrand =
      !normalizedBrand || Boolean(f.brand && f.brand.toLowerCase().includes(normalizedBrand));
    return matchesName && matchesBrand;
  });
  const filteredRecipes = recipes.filter(
    (r) => !normalizedQuery || r.name.toLowerCase().includes(normalizedQuery)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-xl max-h-[94vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#0f131d] border border-white/10 text-zinc-100 shadow-2xl p-5 space-y-4">
        {/* Top Bar: Close + Meal Slot Dropdown */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-[#1e2433] hover:bg-[#272e40] flex items-center justify-center text-zinc-200 transition"
            aria-label="Fermer"
          >
            <XIcon className="w-4 h-4" />
          </button>

          <div className="relative inline-flex items-center">
            <select
              value={mealSlot}
              onChange={(e) => setMealSlot(e.target.value as MealSlot)}
              className="appearance-none bg-transparent pr-6 pl-2 py-1 text-sm font-semibold text-blue-400 focus:outline-none cursor-pointer"
            >
              {MEAL_SLOTS.map((slot) => (
                <option key={slot.value} value={slot.value} className="bg-[#181d2a] text-zinc-100">
                  {slot.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="w-4 h-4 text-blue-400 pointer-events-none -ml-5" />
          </div>

          <span className="text-[11px] font-mono text-zinc-500 min-w-[70px] text-right">
            {selectedDate.slice(5)}
          </span>
        </div>

        {/* Search Bars: Aliment + Marque */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="relative flex items-center sm:col-span-2">
            <SearchIcon className="w-4 h-4 text-zinc-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedFood(null);
                if (tab !== "all" && tab !== "foods" && tab !== "recipes") {
                  setTab("all");
                }
              }}
              placeholder="Aliment (ex: Fromage blanc, Skyr...)"
              className="w-full rounded-full bg-[#181d2a] border border-white/10 pl-10 pr-9 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 text-zinc-400 hover:text-zinc-200"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="relative flex items-center">
            <input
              type="text"
              value={brandQuery}
              onChange={(e) => {
                setBrandQuery(e.target.value);
                setSelectedFood(null);
                if (tab !== "all" && tab !== "foods") {
                  setTab("all");
                }
              }}
              placeholder="Marque (ex: Carrefour)"
              className="w-full rounded-full bg-[#181d2a] border border-white/10 px-4 pr-8 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
            />
            {brandQuery && (
              <button
                type="button"
                onClick={() => setBrandQuery("")}
                className="absolute right-3 text-zinc-400 hover:text-zinc-200"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Underline Tabs */}
        <div className="flex items-center gap-4 overflow-x-auto border-b border-white/10 pb-0.5 no-scrollbar">
          {[
            { id: "all", label: "Tous" },
            { id: "recipes", label: "Mes recettes" },
            { id: "foods", label: "Mes aliments" },
            { id: "barcode", label: "Code-barres" },
            { id: "photo", label: "Photo IA" },
            { id: "text", label: "Texte IA" },
            { id: "manual", label: "Manuel" },
          ].map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id as QuickAddTabMode)}
                className={`whitespace-nowrap pb-2.5 text-xs font-medium border-b-2 transition ${
                  active
                    ? "border-white text-white"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* TAB: TOUS / MES RECETTES / MES ALIMENTS */}
        {(tab === "all" || tab === "recipes" || tab === "foods") && (
          <div className="space-y-4">
            {tab === "all" && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTab("barcode")}
                  className="flex flex-col items-center justify-center gap-2 py-4 px-3 rounded-2xl bg-[#181d2a] hover:bg-[#1f2535] border border-white/[0.06] transition"
                >
                  <BarcodeIcon className="w-6 h-6 text-blue-400" />
                  <span className="text-xs font-medium text-blue-400">Scan de code-barres</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTab("photo")}
                  className="flex flex-col items-center justify-center gap-2 py-4 px-3 rounded-2xl bg-[#181d2a] hover:bg-[#1f2535] border border-white/[0.06] transition"
                >
                  <SparklesIcon className="w-6 h-6 text-blue-400" />
                  <span className="text-xs font-medium text-blue-400">Photo IA / Ajout rapide</span>
                </button>
              </div>
            )}

            {(tab === "all" || tab === "recipes") && !selectedFood && (
              <div className="space-y-3">
                {creatingRecipe ? (
                  <form
                    onSubmit={handleSaveNewRecipe}
                    className="rounded-2xl bg-[#181d2a] border border-white/10 p-4 space-y-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-zinc-100">
                        {editingRecipeId ? "Modifier la recette" : "Créer une recette"}
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setCreatingRecipe(false);
                          setEditingRecipeId(null);
                        }}
                        className="text-xs text-zinc-400 hover:text-zinc-200"
                      >
                        Annuler
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                      <label className="space-y-1 sm:col-span-2">
                        <span className="text-zinc-400">Nom de la recette</span>
                        <input
                          type="text"
                          required
                          value={recipeName}
                          onChange={(e) => setRecipeName(e.target.value)}
                          placeholder="Ex: Porridge protéiné, Bowl poulet..."
                          className="w-full rounded-xl bg-[#0f131d] border border-white/10 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-zinc-400">Nombre de portions</span>
                        <NumberInput
                          min={1}
                          fallback={1}
                          value={recipeServings}
                          onValueChange={setRecipeServings}
                          className="w-full rounded-xl bg-[#0f131d] border border-white/10 px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-blue-500"
                        />
                      </label>
                    </div>

                    {/* Ajouter des ingrédients depuis mes aliments */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-zinc-400">
                        Ajouter un ingrédient (depuis tes aliments)
                      </p>
                      <input
                        type="text"
                        value={recipeIngSearch}
                        onChange={(e) => setRecipeIngSearch(e.target.value)}
                        placeholder="Filtrer mes aliments..."
                        className="w-full rounded-xl bg-[#0f131d] border border-white/10 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
                      />
                      <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                        {foods
                          .filter(
                            (f) =>
                              !recipeIngSearch.trim() ||
                              f.name.toLowerCase().includes(recipeIngSearch.trim().toLowerCase())
                          )
                          .slice(0, 12)
                          .map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() =>
                                setRecipeDraftItems((prev) => [
                                  ...prev,
                                  {
                                    foodName: f.name,
                                    quantityG: f.servingSizeG || 100,
                                    unitType: f.unitType === "unit" ? "unit" : "grams",
                                    unitLabel: f.unitLabel || "unité",
                                    unitWeightG: f.servingSizeG || 100,
                                    per100g: f.per100g,
                                  },
                                ])
                              }
                              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#0f131d] hover:bg-white/[0.06] border border-white/[0.05] text-left text-xs transition"
                            >
                              <span className="truncate text-zinc-200">{f.name}</span>
                              <span className="shrink-0 text-blue-400 font-medium">
                                + {f.servingSizeG || 100}g
                              </span>
                            </button>
                          ))}
                        {foods.length === 0 && (
                          <p className="text-xs text-zinc-500 py-2 text-center">
                            Aucun aliment enregistré pour le moment. Scanne ou crée d&apos;abord des aliments.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Ingrédients ajoutés */}
                    {recipeDraftItems.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                        <p className="text-xs font-medium text-zinc-300">
                          Ingrédients ({recipeDraftItems.length})
                        </p>
                        <div className="space-y-2">
                          {recipeDraftItems.map((ing, idx) => {
                            const isUnit = ing.unitType === "unit";
                            const unitWeight = ing.unitWeightG || 100;
                            const unitCount = Math.round((ing.quantityG / unitWeight) * 100) / 100;
                            return (
                              <div
                                key={`${ing.foodName}-${idx}`}
                                className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#0f131d] border border-white/[0.05] text-xs"
                              >
                                <div className="min-w-0 flex-1">
                                  <span className="truncate block text-zinc-200">{ing.foodName}</span>
                                  {isUnit && (
                                    <span className="text-[10px] text-zinc-500">
                                      1 {ing.unitLabel || "u"} = {unitWeight} g ({ing.quantityG} g)
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRecipeDraftItems((prev) =>
                                        prev.map((item, i) =>
                                          i === idx
                                            ? {
                                                ...item,
                                                unitType: isUnit ? "grams" : "unit",
                                                unitWeightG: item.unitWeightG || 100,
                                              }
                                            : item
                                        )
                                      )
                                    }
                                    className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-medium text-blue-400"
                                    title="Basculer grammes / unité"
                                  >
                                    {isUnit ? ing.unitLabel || "unité" : "g"}
                                  </button>
                                  {isUnit ? (
                                    <NumberInput
                                      min={0.25}
                                      step="0.5"
                                      fallback={1}
                                      value={unitCount}
                                      onValueChange={(cnt) =>
                                        setRecipeDraftItems((prev) =>
                                          prev.map((item, i) =>
                                            i === idx
                                              ? {
                                                  ...item,
                                                  quantityG: Math.round(cnt * unitWeight * 10) / 10,
                                                }
                                              : item
                                          )
                                        )
                                      }
                                      className="w-16 rounded-lg bg-[#181d2a] border border-white/10 px-2 py-1 text-right font-mono text-zinc-100"
                                    />
                                  ) : (
                                    <NumberInput
                                      min={1}
                                      value={ing.quantityG}
                                      onValueChange={(qty) =>
                                        setRecipeDraftItems((prev) =>
                                          prev.map((item, i) =>
                                            i === idx ? { ...item, quantityG: qty } : item
                                          )
                                        )
                                      }
                                      className="w-16 rounded-lg bg-[#181d2a] border border-white/10 px-2 py-1 text-right font-mono text-zinc-100"
                                    />
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRecipeDraftItems((prev) => prev.filter((_, i) => i !== idx))
                                    }
                                    className="p-1 text-zinc-500 hover:text-rose-400"
                                  >
                                    <TrashIcon />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {(() => {
                          const { perServing } = computeRecipeTotals(
                            recipeDraftItems,
                            recipeServings
                          );
                          return (
                            <div className="rounded-xl bg-[#0f131d] p-3 text-xs flex items-center justify-between">
                              <span className="text-zinc-400">Par portion :</span>
                              <span className="font-mono text-blue-400 font-semibold">
                                {perServing.kcal} kcal · P {perServing.proteinG}g · G{" "}
                                {perServing.carbsG}g · L {perServing.fatG}g
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={!recipeName.trim() || recipeDraftItems.length === 0}
                      className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:opacity-40 text-white font-semibold text-sm transition"
                    >
                      Enregistrer la recette
                    </button>
                  </form>
                ) : selectedRecipe ? (
                  <div className="rounded-2xl bg-[#181d2a] border border-white/10 p-4 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <button
                          type="button"
                          onClick={() => setSelectedRecipe(null)}
                          className="text-xs text-blue-400 hover:underline mb-1.5 inline-flex items-center gap-1"
                        >
                          ← Retour aux recettes
                        </button>
                        <h3 className="text-base font-semibold text-zinc-100">
                          {selectedRecipe.name}
                        </h3>
                        <p className="text-xs text-zinc-400">
                          Ajuste les quantités réellement utilisées pour ce repas
                        </p>
                      </div>
                      {onSaveRecipe && (
                        <button
                          type="button"
                          onClick={() => startEditingRecipe(selectedRecipe)}
                          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-blue-400 font-medium"
                        >
                          <PencilIcon className="w-3.5 h-3.5" /> Modifier
                        </button>
                      )}
                    </div>

                    {/* Portions à consigner */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-zinc-400">Portions :</label>
                        <NumberInput
                          min={0.25}
                          step="0.25"
                          fallback={1}
                          value={recipePortionsToLog}
                          onValueChange={setRecipePortionsToLog}
                          className="w-20 rounded-xl bg-[#0f131d] border border-white/10 px-2.5 py-1.5 text-sm font-mono text-zinc-100"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {[0.5, 1, 1.5, 2].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setRecipePortionsToLog(p)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                              recipePortionsToLog === p
                                ? "bg-blue-500 text-white"
                                : "bg-white/5 text-zinc-300 hover:bg-white/10"
                            }`}
                          >
                            {p}x
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Ingrédients ajustables */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                        Ingrédients (pour {selectedRecipe.servings} portion
                        {selectedRecipe.servings > 1 ? "s" : ""})
                      </p>
                      {adjustedRecipeItems.map((ing, idx) => {
                        const isUnit = ing.unitType === "unit";
                        const unitWeight = ing.unitWeightG || 100;
                        const unitCount = Math.round((ing.quantityG / unitWeight) * 100) / 100;
                        return (
                          <div
                            key={`${ing.foodName}-${idx}`}
                            className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#0f131d] border border-white/[0.05] text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="truncate block text-zinc-200">{ing.foodName}</span>
                              {isUnit && (
                                <span className="text-[10px] text-zinc-500">
                                  1 {ing.unitLabel || "u"} = {unitWeight} g ({ing.quantityG} g)
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setAdjustedRecipeItems((prev) =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? {
                                            ...item,
                                            unitType: isUnit ? "grams" : "unit",
                                            unitWeightG: item.unitWeightG || 100,
                                          }
                                        : item
                                    )
                                  )
                                }
                                className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-medium text-blue-400"
                                title="Basculer grammes / unité"
                              >
                                {isUnit ? ing.unitLabel || "unité" : "g"}
                              </button>
                              {isUnit ? (
                                <NumberInput
                                  min={0}
                                  step="0.5"
                                  fallback={0}
                                  value={unitCount}
                                  onValueChange={(cnt) =>
                                    setAdjustedRecipeItems((prev) =>
                                      prev.map((item, i) =>
                                        i === idx
                                          ? {
                                              ...item,
                                              quantityG: Math.round(cnt * unitWeight * 10) / 10,
                                            }
                                          : item
                                      )
                                    )
                                  }
                                  className="w-20 rounded-lg bg-[#181d2a] border border-white/10 px-2 py-1 text-right font-mono text-zinc-100"
                                />
                              ) : (
                                <NumberInput
                                  min={0}
                                  value={ing.quantityG}
                                  onValueChange={(qty) =>
                                    setAdjustedRecipeItems((prev) =>
                                      prev.map((item, i) =>
                                        i === idx ? { ...item, quantityG: qty } : item
                                      )
                                    )
                                  }
                                  className="w-20 rounded-lg bg-[#181d2a] border border-white/10 px-2 py-1 text-right font-mono text-zinc-100"
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {(() => {
                      const { perServing } = computeRecipeTotals(
                        adjustedRecipeItems,
                        selectedRecipe.servings
                      );
                      const mult = Math.max(0.25, recipePortionsToLog);
                      return (
                        <div className="grid grid-cols-4 gap-2 text-center text-xs bg-[#0f131d] p-3 rounded-xl border border-white/[0.06]">
                          <div>
                            <div className="text-zinc-400">Calories</div>
                            <div className="font-semibold text-blue-400 text-sm mt-0.5">
                              {Math.round(perServing.kcal * mult)}
                            </div>
                          </div>
                          <div>
                            <div className="text-zinc-400">Protéines</div>
                            <div className="font-semibold text-amber-400 text-sm mt-0.5">
                              {Math.round(perServing.proteinG * mult * 10) / 10} g
                            </div>
                          </div>
                          <div>
                            <div className="text-zinc-400">Glucides</div>
                            <div className="font-semibold text-teal-400 text-sm mt-0.5">
                              {Math.round(perServing.carbsG * mult * 10) / 10} g
                            </div>
                          </div>
                          <div>
                            <div className="text-zinc-400">Lipides</div>
                            <div className="font-semibold text-purple-400 text-sm mt-0.5">
                              {Math.round(perServing.fatG * mult * 10) / 10} g
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <button
                      type="button"
                      onClick={handleConfirmAdjustedRecipe}
                      className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-semibold text-sm transition"
                    >
                      Ajouter au journal
                    </button>
                  </div>
                ) : (
                  (tab === "recipes" || filteredRecipes.length > 0) && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-zinc-100">Mes recettes</h3>
                        {onSaveRecipe && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRecipeId(null);
                              setRecipeName("");
                              setRecipeServings(1);
                              setRecipeDraftItems([]);
                              setCreatingRecipe(true);
                              setSelectedRecipe(null);
                            }}
                            className="text-xs text-blue-400 hover:underline font-medium"
                          >
                            + Créer une recette
                          </button>
                        )}
                      </div>
                      {filteredRecipes.length === 0 ? (
                        <p className="text-xs text-zinc-500 py-4 text-center">
                          Aucune recette enregistrée. Clique sur « + Créer une recette » pour en créer une.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {filteredRecipes.map((r) => (
                            <div
                              key={r.id}
                              onClick={() => openRecipeDetails(r)}
                              className="cursor-pointer flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-[#181d2a] hover:bg-[#1f2535] border border-white/[0.06] transition"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-zinc-100 truncate">{r.name}</p>
                                <p className="text-xs text-zinc-400">
                                  {r.perServing.kcal} cal, 1 portion (P {r.perServing.proteinG}g · G {r.perServing.carbsG}g · L {r.perServing.fatG}g)
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {onSaveRecipe && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditingRecipe(r);
                                    }}
                                    className="w-8 h-8 rounded-full bg-white/5 hover:bg-blue-500/20 text-zinc-400 hover:text-blue-400 flex items-center justify-center transition"
                                    title="Modifier cette recette"
                                  >
                                    <PencilIcon className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {onDeleteRecipe && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteRecipe(r.id);
                                    }}
                                    className="w-8 h-8 rounded-full bg-white/5 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 flex items-center justify-center transition"
                                    title="Supprimer cette recette"
                                  >
                                    <TrashIcon />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddRecipe(r);
                                  }}
                                  className="w-9 h-9 rounded-full bg-[#242b3d] hover:bg-blue-500 text-blue-400 hover:text-white flex items-center justify-center transition"
                                  title="Consigner 1 portion"
                                >
                                  <PlusIcon className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            )}

            {(tab === "all" || tab === "foods") && selectedFood && (
              <div className="rounded-2xl bg-[#181d2a] border border-white/10 p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelectedFood(null)}
                      className="text-xs text-blue-400 hover:underline mb-1.5 inline-flex items-center gap-1"
                    >
                      ← Retour aux résultats
                    </button>
                    <h3 className="text-base font-semibold text-zinc-100">{selectedFood.name}</h3>
                    {selectedFood.brand && (
                      <p className="text-xs text-zinc-400">{selectedFood.brand}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                    {selectedFood.per100g.kcal} kcal / 100g
                  </span>
                </div>

                {/* Mode Grammes vs À l'unité */}
                <div className="space-y-3">
                  <div className="inline-flex rounded-xl bg-[#0f131d] border border-white/10 p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedQtyMode("grams")}
                      className={`px-3 py-1.5 rounded-lg font-medium transition ${
                        selectedQtyMode === "grams"
                          ? "bg-blue-500 text-white"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      Au gramme (g)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedQtyMode("unit")}
                      className={`px-3 py-1.5 rounded-lg font-medium transition ${
                        selectedQtyMode === "unit"
                          ? "bg-blue-500 text-white"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      À l&apos;unité ({selectedFood.unitLabel || "unité"})
                    </button>
                  </div>

                  {selectedQtyMode === "grams" ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-zinc-400">Quantité (g) :</label>
                        <NumberInput
                          min={1}
                          value={selectedFoodQtyG}
                          onValueChange={setSelectedFoodQtyG}
                          className="w-24 rounded-xl bg-[#0f131d] border border-white/10 px-2.5 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {[100, selectedFood.servingSizeG]
                          .filter((v, i, arr) => v > 0 && arr.indexOf(v) === i)
                          .map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setSelectedFoodQtyG(preset)}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                                selectedFoodQtyG === preset
                                  ? "bg-blue-500 text-white"
                                  : "bg-white/5 text-zinc-300 hover:bg-white/10"
                              }`}
                            >
                              {preset === selectedFood.servingSizeG && preset !== 100
                                ? `Portion (${preset}g)`
                                : `${preset}g`}
                            </button>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-zinc-400">Nombre :</label>
                          <NumberInput
                            min={0.25}
                            step="0.5"
                            fallback={1}
                            value={selectedUnitCount}
                            onValueChange={setSelectedUnitCount}
                            className="w-20 rounded-xl bg-[#0f131d] border border-white/10 px-2.5 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-blue-500"
                          />
                          <span className="text-xs text-zinc-400">
                            {selectedFood.unitLabel || "unité(s)"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {[0.5, 1, 2, 3].map((cnt) => (
                            <button
                              key={cnt}
                              type="button"
                              onClick={() => setSelectedUnitCount(cnt)}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                                selectedUnitCount === cnt
                                  ? "bg-blue-500 text-white"
                                  : "bg-white/5 text-zinc-300 hover:bg-white/10"
                              }`}
                            >
                              {cnt}x
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <span>Poids d&apos;1 {selectedFood.unitLabel || "unité"} (g) :</span>
                        <NumberInput
                          min={1}
                          value={selectedUnitWeightG}
                          onValueChange={setSelectedUnitWeightG}
                          className="w-20 rounded-lg bg-[#0f131d] border border-white/10 px-2 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus:border-blue-500"
                        />
                        <span className="text-zinc-500">
                          = {Math.round(selectedUnitCount * selectedUnitWeightG * 10) / 10} g
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Macros pour la quantité */}
                {(() => {
                  const effectiveQtyG =
                    selectedQtyMode === "unit"
                      ? Math.max(1, Math.round(selectedUnitCount * selectedUnitWeightG * 10) / 10)
                      : Math.max(1, selectedFoodQtyG);
                  const scaled = scaleNutrients(selectedFood.per100g, effectiveQtyG);
                  const microEntries = MICRONUTRIENT_CATALOG.map((meta) => ({
                    meta,
                    val: scaled.micronutrients[meta.key] ?? 0,
                  })).filter((entry) => entry.val > 0);

                  return (
                    <>
                      <div className="grid grid-cols-4 gap-2 text-center text-xs bg-[#0f131d] p-3 rounded-xl border border-white/[0.06]">
                        <div>
                          <div className="text-zinc-400">Calories</div>
                          <div className="font-semibold text-blue-400 text-sm mt-0.5">{scaled.kcal}</div>
                        </div>
                        <div>
                          <div className="text-zinc-400">Protéines</div>
                          <div className="font-semibold text-amber-400 text-sm mt-0.5">{scaled.proteinG} g</div>
                        </div>
                        <div>
                          <div className="text-zinc-400">Glucides</div>
                          <div className="font-semibold text-teal-400 text-sm mt-0.5">{scaled.carbsG} g</div>
                        </div>
                        <div>
                          <div className="text-zinc-400">Lipides</div>
                          <div className="font-semibold text-purple-400 text-sm mt-0.5">{scaled.fatG} g</div>
                        </div>
                      </div>

                      {microEntries.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                            Détails nutritionnels ({effectiveQtyG} g)
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {microEntries.map(({ meta, val }) => (
                              <div
                                key={meta.key}
                                className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#0f131d] border border-white/[0.05] text-xs"
                              >
                                <span className="text-zinc-400 truncate pr-2">{meta.label}</span>
                                <span className="font-mono text-zinc-200 shrink-0">
                                  {val} {meta.unit}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

                <button
                  type="button"
                  onClick={handleConfirmSelectedFood}
                  className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-semibold text-sm transition"
                >
                  Ajouter au journal
                </button>
              </div>
            )}

            {(tab === "all" || tab === "foods") && !selectedFood && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-100">
                    {normalizedQuery || normalizedBrand ? "Résultats" : "Récemment consignés"}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setTab("manual")}
                    className="text-xs text-blue-400 hover:underline"
                  >
                    + Créer un aliment
                  </button>
                </div>
                {filteredFoods.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-4 text-center">
                    Aucun aliment trouvé. Essaie le scan de code-barres, Photo IA ou « Créer un aliment ».
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filteredFoods.map((f) => {
                      const lastLog = getLastLoggedForFood(f);
                      const displayQtyG = lastLog?.quantityG ?? (f.servingSizeG || 100);
                      const scaled = scaleNutrients(f.per100g, displayQtyG);
                      const qtyText = lastLog?.unitQuantity
                        ? `${lastLog.unitQuantity} ${lastLog.unitLabel || f.unitLabel || "unité"} (${displayQtyG} g)`
                        : lastLog
                          ? `${displayQtyG} g`
                          : f.servingLabel;
                      return (
                        <div
                          key={f.id}
                          onClick={() => openFoodDetails(f)}
                          className="cursor-pointer flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-[#181d2a] hover:bg-[#1f2535] border border-white/[0.06] transition"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-100 truncate">{f.name}</p>
                            <p className="text-xs text-zinc-400 truncate">
                              {scaled.kcal} cal, {qtyText}
                              {f.brand ? `, ${f.brand}` : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddSavedFood(f);
                            }}
                            className="shrink-0 w-9 h-9 rounded-full bg-[#242b3d] hover:bg-blue-500 text-blue-400 hover:text-white flex items-center justify-center transition"
                            title="Consigner cet aliment"
                          >
                            <PlusIcon className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {(normalizedQuery.length >= 2 || normalizedBrand.length >= 2) && (
                  <div className="pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        Base Open Food Facts
                      </h4>
                      {offLoading && (
                        <span className="text-xs text-blue-400">Recherche...</span>
                      )}
                    </div>
                    {offError && (
                      <p className="text-xs text-amber-400">{offError}</p>
                    )}
                    {!offLoading && !offError && offResults.length === 0 && (
                      <p className="text-xs text-zinc-500 py-2">
                        Aucun produit trouvé sur Open Food Facts pour « {[searchQuery.trim(), brandQuery.trim()].filter(Boolean).join(" · ")} ».
                      </p>
                    )}
                    <div className="space-y-2">
                      {offResults.map((f) => {
                        const scaled = scaleNutrients(f.per100g, f.servingSizeG);
                        return (
                          <div
                            key={f.id}
                            onClick={() => openFoodDetails(f)}
                            className="cursor-pointer flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-[#181d2a] hover:bg-[#1f2535] border border-white/[0.06] transition"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-zinc-100 truncate">{f.name}</p>
                              <p className="text-xs text-zinc-400 truncate">
                                {scaled.kcal} cal, {f.servingLabel}
                                {f.brand ? `, ${f.brand}` : ""}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSaveCustomFood(f);
                                handleAddSavedFood(f);
                              }}
                              className="shrink-0 w-9 h-9 rounded-full bg-[#242b3d] hover:bg-blue-500 text-blue-400 hover:text-white flex items-center justify-center transition"
                              title="Enregistrer et consigner"
                            >
                              <PlusIcon className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 1: BARCODE */}
        {tab === "barcode" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block w-full cursor-pointer rounded-2xl border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 p-4 text-center transition">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleBarcodePhotoUpload}
                  className="hidden"
                />
                {barcodePhotoPreview ? (
                  <img
                    src={barcodePhotoPreview}
                    alt="Photo du code-barres"
                    className="mx-auto max-h-40 rounded-xl object-cover"
                  />
                ) : (
                  <div className="py-3 text-xs text-zinc-400 space-y-1">
                    <CameraIcon className="w-6 h-6 mx-auto text-emerald-400" />
                    <p className="font-medium text-zinc-200">
                      Photo ou image du code-barres (IA Gemini)
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Gemini lit les chiffres automatiquement et charge la fiche Open Food Facts
                    </p>
                  </div>
                )}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="cursor-pointer py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-center">
                  📷 Prendre une photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleBarcodePhotoUpload}
                    className="hidden"
                  />
                </label>
                <label className="cursor-pointer py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-center">
                  🖼️ Importer une image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleBarcodePhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Ou saisis le code : 3017620422003"
                className="flex-1 rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => lookupBarcode()}
                disabled={barcodeLoading}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-sm font-semibold disabled:opacity-50"
              >
                {barcodeLoading ? "..." : "Chercher"}
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={scanningCamera ? stopCamera : startCameraScan}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium inline-flex items-center gap-1.5"
              >
                <CameraIcon className="w-3.5 h-3.5 text-zinc-400" />
                {scanningCamera ? "Arrêter flux vidéo" : "Flux vidéo en direct (optionnel)"}
              </button>
              <span className="text-[11px] text-zinc-500">Open Food Facts</span>
            </div>

            {scanningCamera && (
              <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-black">
                <video ref={videoRef} autoPlay muted playsInline className="w-full max-h-56 object-cover" />
              </div>
            )}

            {barcodeError && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                {barcodeError}
              </div>
            )}

            {foundProduct && (
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-semibold text-sm">{foundProduct.name}</p>
                    {foundProduct.brand && (
                      <p className="text-xs text-zinc-400">{foundProduct.brand}</p>
                    )}
                  </div>
                  <span className="text-xs font-mono text-emerald-400">
                    {foundProduct.per100g.kcal} kcal / 100g
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-xs text-zinc-400">Quantité (g) :</label>
                  <NumberInput
                    min={1}
                    value={productQtyG}
                    onValueChange={setProductQtyG}
                    className="w-24 rounded-xl bg-zinc-900 border border-zinc-700 px-2.5 py-1.5 text-sm font-mono"
                  />
                </div>

                {(() => {
                  const scaled = scaleNutrients(foundProduct.per100g, productQtyG);
                  return (
                    <div className="grid grid-cols-4 gap-2 text-center text-xs bg-zinc-900 p-2.5 rounded-xl">
                      <div>
                        <div className="text-zinc-400">Kcal</div>
                        <div className="font-semibold text-emerald-400">{scaled.kcal}</div>
                      </div>
                      <div>
                        <div className="text-zinc-400">Prot</div>
                        <div className="font-semibold">{scaled.proteinG} g</div>
                      </div>
                      <div>
                        <div className="text-zinc-400">Gluc</div>
                        <div className="font-semibold">{scaled.carbsG} g</div>
                      </div>
                      <div>
                        <div className="text-zinc-400">Lip</div>
                        <div className="font-semibold">{scaled.fatG} g</div>
                      </div>
                    </div>
                  );
                })()}

                <button
                  type="button"
                  onClick={handleConfirmBarcode}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm"
                >
                  Ajouter au journal
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2 & 3: GEMINI PHOTO / TEXT */}
        {(tab === "photo" || tab === "text") && (
          <div className="space-y-4">
            {tab === "photo" && (
              <div className="space-y-2">
                <label className="block w-full cursor-pointer rounded-2xl border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 p-4 text-center transition">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  {photoPreview ? (
                    <img
                      src={photoPreview}
                      alt="Aperçu du repas"
                      className="mx-auto max-h-48 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="py-4 text-xs text-zinc-400 space-y-1">
                      <CameraIcon className="w-6 h-6 mx-auto text-emerald-400" />
                      <p>Prendre une photo ou importer une image de repas</p>
                    </div>
                  )}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="cursor-pointer py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-center">
                    📷 Prendre une photo
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                  <label className="cursor-pointer py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-center">
                    🖼️ Importer depuis galerie
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            )}

            <textarea
              rows={3}
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder={
                tab === "photo"
                  ? "Précision optionnelle pour Gemini (ex: 'cuisson à l'huile d'olive, 180g de poulet')"
                  : "Décris ton repas (ex: '2 œufs au plat, 2 tranches de pain complet, 10g de beurre, 1 café au lait')"
              }
              className="w-full rounded-2xl bg-zinc-950 border border-zinc-800 p-3 text-sm focus:outline-none focus:border-emerald-500"
            />

            <button
              type="button"
              disabled={aiLoading || (tab === "photo" ? !photoPreview : !aiText.trim())}
              onClick={() => runGeminiAnalysis(tab)}
              className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              <SparklesIcon className="w-4 h-4" />
              {aiLoading ? "Analyse Gemini en cours..." : "Analyser avec Gemini"}
            </button>

            {aiError && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                {aiError}
              </div>
            )}

            {aiItems.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-zinc-400">
                  Aperçu éditable avant validation ({aiItems.length} élément{aiItems.length > 1 ? "s" : ""}) :
                </p>
                {aiItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateAiItem(idx, { name: e.target.value })}
                        className="flex-1 bg-transparent font-medium text-sm focus:outline-none border-b border-transparent focus:border-zinc-700"
                      />
                      <button
                        type="button"
                        onClick={() => setAiItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-zinc-500 hover:text-rose-400 p-1"
                        title="Supprimer"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 text-xs">
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-zinc-500">Grammes</span>
                        <NumberInput
                          min={1}
                          value={item.estimatedGrams}
                          onValueChange={(val) =>
                            updateAiItem(idx, { estimatedGrams: val })
                          }
                          className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1 font-mono"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-zinc-500">Kcal</span>
                        <NumberInput
                          min={0}
                          value={item.kcal}
                          onValueChange={(val) => updateAiItem(idx, { kcal: val })}
                          className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1 font-mono text-emerald-400"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-zinc-500">Prot (g)</span>
                        <NumberInput
                          min={0}
                          step="0.1"
                          value={item.proteinG}
                          onValueChange={(val) => updateAiItem(idx, { proteinG: val })}
                          className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1 font-mono"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-zinc-500">Gluc (g)</span>
                        <NumberInput
                          min={0}
                          step="0.1"
                          value={item.carbsG}
                          onValueChange={(val) => updateAiItem(idx, { carbsG: val })}
                          className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1 font-mono"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-zinc-500">Lip (g)</span>
                        <NumberInput
                          min={0}
                          step="0.1"
                          value={item.fatG}
                          onValueChange={(val) => updateAiItem(idx, { fatG: val })}
                          className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1 font-mono"
                        />
                      </label>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleConfirmAiItems}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm"
                >
                  Valider et ajouter au journal
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: MANUAL / SAVED FOODS / RECIPES */}
        {tab === "manual" && (
          <div className="space-y-5">
            {recipes.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-400">Recettes enregistrées</p>
                <div className="grid gap-2">
                  {recipes.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleAddRecipe(r)}
                      className="flex items-center justify-between p-3 rounded-2xl bg-zinc-950 border border-zinc-800 hover:border-emerald-500/50 text-left"
                    >
                      <div>
                        <p className="text-sm font-medium">{r.name}</p>
                        <p className="text-xs text-zinc-400">
                          P {r.perServing.proteinG}g · G {r.perServing.carbsG}g · L {r.perServing.fatG}g
                        </p>
                      </div>
                      <span className="text-xs font-mono text-emerald-400">
                        +{r.perServing.kcal} kcal
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-400">Aliments fréquents</p>
              <div className="grid gap-2 max-h-40 overflow-y-auto">
                {foods.map((f) => {
                  const scaled = scaleNutrients(f.per100g, f.servingSizeG);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => handleAddSavedFood(f)}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-emerald-500/50 text-left"
                    >
                      <div>
                        <p className="text-sm font-medium">{f.name}</p>
                        <p className="text-[11px] text-zinc-400">{f.servingLabel}</p>
                      </div>
                      <span className="text-xs font-mono text-emerald-400">+{scaled.kcal} kcal</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <form onSubmit={handleAddManualCustom} className="space-y-3 pt-2 border-t border-zinc-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-zinc-400">Créer & ajouter un aliment manuel</p>
                <div className="inline-flex rounded-xl bg-zinc-950 border border-zinc-800 p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setManualUnitType("grams")}
                    className={`px-2.5 py-1 rounded-lg font-medium transition ${
                      manualUnitType === "grams"
                        ? "bg-emerald-500 text-zinc-950 font-semibold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Au gramme (g)
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualUnitType("unit")}
                    className={`px-2.5 py-1 rounded-lg font-medium transition ${
                      manualUnitType === "unit"
                        ? "bg-emerald-500 text-zinc-950 font-semibold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    À l&apos;unité
                  </button>
                </div>
              </div>

              <input
                type="text"
                required
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder={
                  manualUnitType === "unit"
                    ? "Nom (ex: Œuf, Pomme, Banane...)"
                    : "Nom de l'aliment"
                }
                className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm"
              />

              {manualUnitType === "unit" && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="space-y-1">
                    <span className="text-zinc-400">Libellé unité</span>
                    <input
                      type="text"
                      value={manualUnitLabel}
                      onChange={(e) => setManualUnitLabel(e.target.value)}
                      placeholder="unité, œuf, fruit..."
                      className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-2.5 py-1.5"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-zinc-400">Nombre à consigner</span>
                    <NumberInput
                      min={0.25}
                      step="0.5"
                      fallback={1}
                      value={manualUnitCount}
                      onValueChange={setManualUnitCount}
                      className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-2.5 py-1.5 font-mono"
                    />
                  </label>
                </div>
              )}

              <p className="text-[11px] text-zinc-500">
                {manualUnitType === "unit"
                  ? `Valeurs nutritionnelles pour 1 ${manualUnitLabel.trim() || "unité"} :`
                  : "Valeurs nutritionnelles pour la quantité indiquée :"}
              </p>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
                <label className="space-y-1">
                  <span className="text-zinc-400">
                    {manualUnitType === "unit" ? "Poids/u (g)" : "Qté (g)"}
                  </span>
                  <NumberInput
                    min={1}
                    value={manualQty}
                    onValueChange={setManualQty}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1.5 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Kcal</span>
                  <NumberInput
                    min={0}
                    value={manualKcal}
                    onValueChange={setManualKcal}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1.5 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Prot (g)</span>
                  <NumberInput
                    min={0}
                    step="0.1"
                    value={manualP}
                    onValueChange={setManualP}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1.5 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Gluc (g)</span>
                  <NumberInput
                    min={0}
                    step="0.1"
                    value={manualC}
                    onValueChange={setManualC}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1.5 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Lip (g)</span>
                  <NumberInput
                    min={0}
                    step="0.1"
                    value={manualF}
                    onValueChange={setManualF}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1.5 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Fibres</span>
                  <NumberInput
                    min={0}
                    step="0.1"
                    value={manualFiber}
                    onValueChange={setManualFiber}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1.5 font-mono"
                  />
                </label>
              </div>
              {manualSavedMsg && (
                <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2">
                  {manualSavedMsg}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleCreateFoodOnly}
                  disabled={!manualName.trim()}
                  className="py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-semibold text-sm disabled:opacity-40"
                >
                  Créer
                </button>
                <button
                  type="submit"
                  className="py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm"
                >
                  Créer & ajouter
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
