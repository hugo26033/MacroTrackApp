-- MacroPulse — Schéma Supabase (PostgreSQL + Row Level Security)
-- À exécuter dans l'éditeur SQL de votre projet Supabase.

create extension if not exists "pgcrypto";

-- 1. Profil utilisateur & préférences
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  sex text check (sex in ('male', 'female')) default 'male',
  birth_date date,
  height_cm numeric(5,1),
  activity_level text check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')) default 'moderate',
  body_fat_pct numeric(4,1),
  theme text check (theme in ('dark', 'light')) default 'dark',
  fasting_target_hours numeric(4,1) default 16.0,
  weight_trend_threshold_kg_week numeric(4,2) default 0.15,
  adaptive_tdee_enabled boolean default true,
  pinned_micronutrients jsonb default '["fiber_g", "sugar_g", "saturated_fat_g", "sodium_mg", "iron_mg", "vitamin_d_ug", "magnesium_mg"]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Objectifs nutritionnels & pas (historisés par date d'effet)
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  effective_from date not null default current_date,
  goal_type text check (goal_type in ('cut', 'maintain', 'bulk')) default 'maintain',
  target_kcal integer not null default 2200,
  macro_mode text check (macro_mode in ('grams', 'percent', 'per_kg')) default 'grams',
  protein_g numeric(6,1) not null default 160,
  carbs_g numeric(6,1) not null default 220,
  fat_g numeric(6,1) not null default 70,
  fiber_g numeric(6,1) default 30,
  sugar_g numeric(6,1) default 50,
  saturated_fat_g numeric(6,1) default 22,
  sodium_mg numeric(7,1) default 2300,
  target_steps integer default 10000,
  target_water_ml integer default 2500,
  custom_micronutrients jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- 3. Base d'aliments (personnels + cache Open Food Facts)
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  barcode text,
  name text not null,
  brand text,
  serving_size_g numeric(7,1) default 100,
  serving_label text default '100 g',
  kcal_per_100g numeric(7,2) not null,
  protein_per_100g numeric(6,2) not null default 0,
  carbs_per_100g numeric(6,2) not null default 0,
  fat_per_100g numeric(6,2) not null default 0,
  fiber_per_100g numeric(6,2) default 0,
  sugar_per_100g numeric(6,2) default 0,
  saturated_fat_per_100g numeric(6,2) default 0,
  sodium_mg_per_100g numeric(7,2) default 0,
  micronutrients_per_100g jsonb default '{}'::jsonb,
  source text check (source in ('manual', 'openfoodfacts', 'gemini', 'recipe')) default 'manual',
  created_at timestamptz default now()
);

create index if not exists idx_foods_barcode on public.foods(barcode);
create index if not exists idx_foods_user on public.foods(user_id);

-- 4. Recettes composées
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  servings integer not null default 1,
  items jsonb not null default '[]'::jsonb,
  total_kcal numeric(8,2) not null default 0,
  total_protein_g numeric(7,2) not null default 0,
  total_carbs_g numeric(7,2) not null default 0,
  total_fat_g numeric(7,2) not null default 0,
  created_at timestamptz default now()
);

-- 5. Journal alimentaire (avec timestamp précis pour le jeûne intermittent automatique)
create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz not null default now(),
  log_date date not null default current_date,
  meal_slot text check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')) default 'lunch',
  food_name text not null,
  brand text,
  barcode text,
  quantity_g numeric(7,1) not null default 100,
  kcal numeric(7,1) not null,
  protein_g numeric(6,1) not null default 0,
  carbs_g numeric(6,1) not null default 0,
  fat_g numeric(6,1) not null default 0,
  fiber_g numeric(6,1) default 0,
  sugar_g numeric(6,1) default 0,
  saturated_fat_g numeric(6,1) default 0,
  sodium_mg numeric(7,1) default 0,
  micronutrients jsonb default '{}'::jsonb,
  source text check (source in ('manual', 'barcode', 'gemini_photo', 'gemini_text', 'recipe')) default 'manual',
  created_at timestamptz default now()
);

create index if not exists idx_food_logs_user_date on public.food_logs(user_id, log_date);

-- 6. Journal de poids
create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  weight_kg numeric(5,2) not null,
  note text,
  created_at timestamptz default now(),
  unique (user_id, log_date)
);

-- 7. Journal de pas
create table if not exists public.step_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  steps integer not null default 0,
  source text check (source in ('manual', 'import_apple', 'import_google', 'import_csv')) default 'manual',
  created_at timestamptz default now(),
  unique (user_id, log_date)
);

-- 8. Journal d'hydratation
create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null default current_date,
  amount_ml integer not null,
  created_at timestamptz default now()
);

-- Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.foods enable row level security;
alter table public.recipes enable row level security;
alter table public.food_logs enable row level security;
alter table public.weight_logs enable row level security;
alter table public.step_logs enable row level security;
alter table public.water_logs enable row level security;

create policy "Users manage own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "Users manage own goals" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own foods" on public.foods
  for all using (auth.uid() = user_id or user_id is null) with check (auth.uid() = user_id);

create policy "Users manage own recipes" on public.recipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own food_logs" on public.food_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own weight_logs" on public.weight_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own step_logs" on public.step_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own water_logs" on public.water_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
