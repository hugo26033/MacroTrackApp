"use client";

import React, { useEffect, useRef, useState } from "react";
import { scaleNutrients } from "@/lib/calculations";
import {
  MICRONUTRIENT_CATALOG,
  type FoodItem,
  type FoodLogEntry,
  type GeminiDetectedFood,
  type MealSlot,
  type Recipe,
} from "@/lib/types";
import {
  BarcodeIcon,
  CameraIcon,
  ChevronDownIcon,
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
  initialTab?: QuickAddTabMode;
  initialMealSlot?: MealSlot;
  onAddFoodLogs: (logs: Omit<FoodLogEntry, "id">[]) => void;
  onSaveCustomFood: (food: FoodItem) => void;
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
  initialTab = "all",
  initialMealSlot = "lunch",
  onAddFoodLogs,
  onSaveCustomFood,
}: QuickAddModalProps) {
  const [tab, setTab] = useState<QuickAddTabMode>(initialTab);
  const [mealSlot, setMealSlot] = useState<MealSlot>(initialMealSlot);
  const [searchQuery, setSearchQuery] = useState("");
  const [brandQuery, setBrandQuery] = useState("");
  const [offResults, setOffResults] = useState<FoodItem[]>([]);
  const [offLoading, setOffLoading] = useState(false);
  const [offError, setOffError] = useState<string | null>(null);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [selectedFoodQtyG, setSelectedFoodQtyG] = useState<number>(100);

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
  const [manualQty, setManualQty] = useState(100);
  const [manualKcal, setManualKcal] = useState(200);
  const [manualP, setManualP] = useState(15);
  const [manualC, setManualC] = useState(20);
  const [manualF, setManualF] = useState(6);
  const [manualFiber, setManualFiber] = useState(2);

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

    const mime = file.type || "image/jpeg";
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      setBarcodePhotoPreview(dataUrl);
      try {
        const res = await fetch("/api/ai/read-barcode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: dataUrl, mimeType: mime }),
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
        setBarcodeError("Impossible de lire le code-barres via Gemini.");
        setBarcodeLoading(false);
      } finally {
        input.value = "";
      }
    };
    reader.readAsDataURL(file);
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
        setProductQtyG(data.product.servingSizeG || 100);
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
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoMime(file.type || "image/jpeg");
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(String(reader.result));
    };
    reader.readAsDataURL(file);
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
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || "Erreur Gemini.");
      } else {
        setAiItems(data.items ?? []);
      }
    } catch {
      setAiError("Impossible de contacter l'API Gemini.");
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

  function handleAddSavedFood(food: FoodItem) {
    const qty = food.servingSizeG || 100;
    onAddFoodLogs([
      {
        logDate: selectedDate,
        loggedAt: new Date().toISOString(),
        mealSlot,
        foodName: food.name,
        brand: food.brand,
        barcode: food.barcode,
        quantityG: qty,
        nutrients: scaleNutrients(food.per100g, qty),
        source: "manual",
      },
    ]);
    onClose();
  }

  function handleAddRecipe(recipe: Recipe) {
    onAddFoodLogs([
      {
        logDate: selectedDate,
        loggedAt: new Date().toISOString(),
        mealSlot,
        foodName: `${recipe.name} (1 portion)`,
        quantityG: recipe.items.reduce((s, i) => s + i.quantityG, 0) / Math.max(1, recipe.servings),
        nutrients: recipe.perServing,
        source: "recipe",
      },
    ]);
    onClose();
  }

  function handleAddManualCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!manualName.trim()) return;
    const factor = 100 / Math.max(1, manualQty);
    const customFood: FoodItem = {
      id: `custom-${Date.now()}`,
      name: manualName.trim(),
      servingSizeG: manualQty,
      servingLabel: `${manualQty} g`,
      per100g: {
        kcal: Math.round(manualKcal * factor),
        proteinG: Math.round(manualP * factor * 10) / 10,
        carbsG: Math.round(manualC * factor * 10) / 10,
        fatG: Math.round(manualF * factor * 10) / 10,
        micronutrients: { fiber_g: Math.round(manualFiber * factor * 10) / 10 },
      },
      source: "manual",
    };
    onSaveCustomFood(customFood);
    onAddFoodLogs([
      {
        logDate: selectedDate,
        loggedAt: new Date().toISOString(),
        mealSlot,
        foodName: customFood.name,
        quantityG: manualQty,
        nutrients: {
          kcal: manualKcal,
          proteinG: manualP,
          carbsG: manualC,
          fatG: manualF,
          micronutrients: { fiber_g: manualFiber },
        },
        source: "manual",
      },
    ]);
    setManualName("");
    onClose();
  }

  function openFoodDetails(food: FoodItem) {
    setSelectedFood(food);
    setSelectedFoodQtyG(food.servingSizeG || 100);
  }

  function handleConfirmSelectedFood() {
    if (!selectedFood) return;
    const nutrients = scaleNutrients(selectedFood.per100g, selectedFoodQtyG);
    onSaveCustomFood(selectedFood);
    onAddFoodLogs([
      {
        logDate: selectedDate,
        loggedAt: new Date().toISOString(),
        mealSlot,
        foodName: selectedFood.name,
        brand: selectedFood.brand,
        barcode: selectedFood.barcode,
        quantityG: selectedFoodQtyG,
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

            {(tab === "all" || tab === "recipes") && filteredRecipes.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-zinc-100">Mes recettes</h3>
                <div className="space-y-2">
                  {filteredRecipes.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-[#181d2a] border border-white/[0.06]"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-100 truncate">{r.name}</p>
                        <p className="text-xs text-zinc-400">
                          {r.perServing.kcal} cal, 1 portion (P {r.perServing.proteinG}g · G {r.perServing.carbsG}g · L {r.perServing.fatG}g)
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddRecipe(r)}
                        className="shrink-0 w-9 h-9 rounded-full bg-[#242b3d] hover:bg-blue-500 text-blue-400 hover:text-white flex items-center justify-center transition"
                        title="Ajouter cette recette"
                      >
                        <PlusIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
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

                {/* Quantité */}
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

                {/* Macros pour la quantité */}
                {(() => {
                  const scaled = scaleNutrients(selectedFood.per100g, selectedFoodQtyG);
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
                            Détails nutritionnels ({selectedFoodQtyG} g)
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
              <p className="text-xs font-medium text-zinc-400">Créer & ajouter un aliment manuel</p>
              <input
                type="text"
                required
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Nom de l'aliment"
                className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
                <label className="space-y-1">
                  <span className="text-zinc-400">Qté (g)</span>
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
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm"
              >
                Enregistrer & ajouter
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
