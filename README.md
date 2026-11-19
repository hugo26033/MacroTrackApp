# MacroPulse

Application web progressive (PWA) mobile-first de suivi nutritionnel, calories, macros, micronutriments, hydratation, pas et tendances de poids.

## Fonctionnalités principales

- **Journal quotidien** : suivi des calories, glucides, lipides, protéines, micronutriments épinglés, eau, pas et notes journalières.
- **Ajout rapide multi-sources** : recherche locale & Open Food Facts, scan de code-barres (caméra + photo via ZXing WASM local avec fallback Gemini), analyse photo/texte par IA (Gemini), créateur de recettes et saisie manuelle.
- **Optimiseur de macros** : solveur hybride pour compléter la journée ou planifier ses quantités.
- **Progression & Objectifs** : courbes de poids avec moyennes mobiles 3j / 5j, corrélation avec les calories de la veille, calcul TDEE adaptatif.
- **Stockage local-first** : persistance dans `localStorage` avec export CSV et export/import JSON complet.

## Développement local

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

### Variables d'environnement

- `GEMINI_API_KEY` *(optionnelle en local, requise pour les fonctionnalités IA)* : clé API Google Gemini utilisée par les routes `/api/ai/*`.

## Scripts utiles

- `npm run dev` — serveur de développement Next.js (Turbopack)
- `npm run lint` — vérification ESLint (React 19 / Next.js)
- `npm run build` — build de production et vérification TypeScript

## Architecture & Persistance

L'application fonctionne actuellement 100 % côté client (`localStorage` via `src/lib/storage.ts`), avec quelques routes API Next.js pour Open Food Facts et Gemini. Le fichier `supabase/schema.sql` est conservé comme schéma SQL de référence pour une éventuelle synchronisation cloud future et n'est pas requis pour exécuter l'application.
