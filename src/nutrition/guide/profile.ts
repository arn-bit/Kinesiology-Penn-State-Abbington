import { ALLERGENS, DIETS, NUTRITION_GOALS, WATER_TARGET, CUP_ML, type NutritionProfile, type WaterEntry, type NutritionGoalId } from './types';

export function emptyNutritionProfile(now: Date = new Date()): NutritionProfile {
  return {
    allergiesConfirmed: false,
    allergens: [],
    otherAllergens: [],
    diets: [],
    likes: [],
    dislikes: [],
    goals: [],
    waterTargetCups: WATER_TARGET.start,
    updatedAt: now.toISOString(),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const pickEnum = <T extends string>(v: unknown, allowed: readonly T[]): T[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is T => typeof x === 'string' && (allowed as readonly string[]).includes(x)))] : []);

const words = (v: unknown, maxItems: number): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.trim().replace(/\s+/g, ' ').slice(0, 40)).filter((x) => x.length >= 2))].slice(0, maxItems)
    : [];

/** Shape-check a saved nutrition profile. Anything unknown or malformed is dropped, never trusted. */
export function normalizeNutritionProfile(raw: unknown): NutritionProfile | null {
  if (!isObj(raw)) return null;
  const base = emptyNutritionProfile(new Date(0));
  const cups = typeof raw.waterTargetCups === 'number' && Number.isFinite(raw.waterTargetCups) ? Math.round(raw.waterTargetCups) : base.waterTargetCups;
  return {
    allergiesConfirmed: raw.allergiesConfirmed === true,
    allergens: pickEnum(raw.allergens, ALLERGENS),
    otherAllergens: words(raw.otherAllergens, 12),
    diets: pickEnum(raw.diets, DIETS),
    likes: words(raw.likes, 20),
    dislikes: words(raw.dislikes, 20),
    goals: pickEnum<NutritionGoalId>(raw.goals, NUTRITION_GOALS),
    waterTargetCups: Math.max(WATER_TARGET.min, Math.min(WATER_TARGET.max, cups)),
    updatedAt: typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt)) ? raw.updatedAt : base.updatedAt,
  };
}

export function normalizeWater(raw: unknown): WaterEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((w): w is Record<string, unknown> => isObj(w) && typeof w.id === 'string' && typeof w.at === 'string' && !Number.isNaN(Date.parse(w.at)) && typeof w.ml === 'number' && Number.isFinite(w.ml))
    .map((w) => ({ id: String(w.id).slice(0, 60), at: String(w.at), ml: Math.max(0, Math.min(3000, Math.round(w.ml as number))) }))
    .slice(-1500);
}

export const cupsToMl = (cups: number) => Math.round(cups * CUP_ML);
