"use client";

import React, { useEffect, useRef, useState } from "react";
import { scaleNutrients } from "@/lib/calculations";
import type {
  FoodItem,
  FoodLogEntry,
  GeminiDetectedFood,
  MealSlot,
  Recipe,
} from "@/lib/types";
import { BarcodeIcon, CameraIcon, PlusIcon, SparklesIcon, TrashIcon } from "./Icons";

type TabMode = "barcode" | "photo" | "text" | "manual";

interface QuickAddModalProps {
  open: boolean;
  onClose: () => void;
  selectedDate: string;
  foods: FoodItem[];
  recipes: Recipe[];
  onAddFoodLogs: (logs: Omit<FoodLogEntry, "id">[]) => void;
  onSaveCustomFood: (food: FoodItem) => void;
}

const MEAL_SLOTS: { value: MealSlot; label: string }[] = [
  { value: "breakfast", label: "Petit-déj" },
  { value: "lunch", label: "Déjeuner" },
  { value: "dinner", label: "Dîner" },
  { value: "snack", label: "Collation" },
];

export function QuickAddModal({
  open,
  onClose,
  selectedDate,
  foods,
  recipes,
  onAddFoodLogs,
  onSaveCustomFood,
}: QuickAddModalProps) {
  const [tab, setTab] = useState<TabMode>("barcode");
  const [mealSlot, setMealSlot] = useState<MealSlot>("lunch");

  // Barcode state
  const [barcodeInput, setBarcodeInput] = useState("");
  const [scanningCamera, setScanningCamera] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [foundProduct, setFoundProduct] = useState<FoodItem | null>(null);
  const [productQtyG, setProductQtyG] = useState<number>(100);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
    if (!open) {
      stopCamera();
    }
    return () => stopCamera();
  }, [open]);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanningCamera(false);
  }

  async function startCameraScan() {
    setBarcodeError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setBarcodeError("Caméra indisponible sur ce navigateur. Saisis le code-barres manuellement.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setScanningCamera(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Utilise BarcodeDetector natif si supporté (Chrome/Android/Edge)
      const BarcodeDetectorCtor = (
        window as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => {
            detect: (src: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
          };
        }
      ).BarcodeDetector;

      if (!BarcodeDetectorCtor) {
        setBarcodeError(
          "Caméra ouverte. La détection auto n'est pas supportée sur ce navigateur : saisis le code ci-dessous."
        );
        return;
      }

      const detector = new BarcodeDetectorCtor({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
      });

      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
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
        if (streamRef.current) {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    } catch {
      setBarcodeError("Permission caméra refusée ou indisponible.");
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-zinc-900 border border-zinc-800 text-zinc-100 shadow-2xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Ajout rapide</h2>
            <p className="text-xs text-zinc-400">Date : {selectedDate}</p>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium"
          >
            Fermer
          </button>
        </div>

        {/* Sélecteur de repas */}
        <div className="grid grid-cols-4 gap-1.5 bg-zinc-950 p-1 rounded-2xl border border-zinc-800">
          {MEAL_SLOTS.map((slot) => (
            <button
              key={slot.value}
              type="button"
              onClick={() => setMealSlot(slot.value)}
              className={`py-2 rounded-xl text-xs font-medium transition ${
                mealSlot === slot.value
                  ? "bg-emerald-500 text-zinc-950 font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {slot.label}
            </button>
          ))}
        </div>

        {/* Onglets */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { id: "barcode", label: "Code-barres", icon: BarcodeIcon },
            { id: "photo", label: "Photo IA", icon: CameraIcon },
            { id: "text", label: "Texte IA", icon: SparklesIcon },
            { id: "manual", label: "Manuel", icon: PlusIcon },
          ].map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id as TabMode)}
                className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-2xl border text-xs font-medium transition ${
                  active
                    ? "bg-emerald-500/15 border-emerald-500/60 text-emerald-300"
                    : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: BARCODE */}
        {tab === "barcode" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Ex: 3017620422003 (Nutella, Skyr...)"
                className="flex-1 rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500"
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

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={scanningCamera ? stopCamera : startCameraScan}
                className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium inline-flex items-center gap-2"
              >
                <CameraIcon className="w-4 h-4 text-emerald-400" />
                {scanningCamera ? "Arrêter la caméra" : "Scanner avec la caméra"}
              </button>
              <span className="text-[11px] text-zinc-500">Base Open Food Facts</span>
            </div>

            {scanningCamera && (
              <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-black">
                <video ref={videoRef} className="w-full max-h-56 object-cover" muted playsInline />
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
                  <input
                    type="number"
                    min={1}
                    value={productQtyG}
                    onChange={(e) => setProductQtyG(Math.max(1, Number(e.target.value)))}
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
                    capture="environment"
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
                      <p>Prendre une photo ou choisir une image de repas</p>
                    </div>
                  )}
                </label>
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
                        <input
                          type="number"
                          value={item.estimatedGrams}
                          onChange={(e) =>
                            updateAiItem(idx, { estimatedGrams: Number(e.target.value) })
                          }
                          className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1 font-mono"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-zinc-500">Kcal</span>
                        <input
                          type="number"
                          value={item.kcal}
                          onChange={(e) => updateAiItem(idx, { kcal: Number(e.target.value) })}
                          className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1 font-mono text-emerald-400"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-zinc-500">Prot (g)</span>
                        <input
                          type="number"
                          value={item.proteinG}
                          onChange={(e) => updateAiItem(idx, { proteinG: Number(e.target.value) })}
                          className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1 font-mono"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-zinc-500">Gluc (g)</span>
                        <input
                          type="number"
                          value={item.carbsG}
                          onChange={(e) => updateAiItem(idx, { carbsG: Number(e.target.value) })}
                          className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1 font-mono"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-[10px] text-zinc-500">Lip (g)</span>
                        <input
                          type="number"
                          value={item.fatG}
                          onChange={(e) => updateAiItem(idx, { fatG: Number(e.target.value) })}
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
                  <input
                    type="number"
                    value={manualQty}
                    onChange={(e) => setManualQty(Number(e.target.value))}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1.5 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Kcal</span>
                  <input
                    type="number"
                    value={manualKcal}
                    onChange={(e) => setManualKcal(Number(e.target.value))}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1.5 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Prot (g)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={manualP}
                    onChange={(e) => setManualP(Number(e.target.value))}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1.5 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Gluc (g)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={manualC}
                    onChange={(e) => setManualC(Number(e.target.value))}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1.5 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Lip (g)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={manualF}
                    onChange={(e) => setManualF(Number(e.target.value))}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1.5 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Fibres</span>
                  <input
                    type="number"
                    step="0.1"
                    value={manualFiber}
                    onChange={(e) => setManualFiber(Number(e.target.value))}
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
