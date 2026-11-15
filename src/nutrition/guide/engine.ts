import type { Plan, SessionLog } from '../../domain/types';
import { todayIndex } from '../../domain/dates';
import type { MealEntry } from '../foods';
import { GUIDE_FOODS, type GuideFood } from './catalog';
import { groupsForFoodId } from './logged';
import { exclusions, likedWords, type Exclusion } from './rules';
import { GROUPS, GROUP_LABEL, SLOTS, type FoodGroup, type NutritionGoalId, type NutritionProfile, type Reason, type Slot, type WaterEntry } from './types';

/**
 * The recommendation engine. It is plain, deterministic code: the same profile, logs and date always give
 * the same answer, every suggestion carries the reasons and sources behind it, and the safety rules in
 * rules.ts run first. There is no model, no guessing and nothing leaves the device.
 */

/* ───────────── Dates ───────────── */

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The last `n` local days ending today, oldest first. Built at noon so daylight-saving changes cannot skip or repeat a day. */
export function lastDays(now: Date, n = 7): Date[] {
  return Array.from({ length: n }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1 - i), 12));
}

/* ───────────── What was eaten ───────────── */

export interface DayInfo {
  key: string;
  date: Date;
  meals: MealEntry[];
  groups: FoodGroup[];
  slots: Slot[];
  waterMl: number;
  foods: string[];
}

export function weekView(meals: readonly MealEntry[], water: readonly WaterEntry[], now: Date, days = 7): DayInfo[] {
  return lastDays(now, days).map((date) => {
    const key = dayKey(date);
    const ms = meals.filter((m) => dayKey(new Date(m.at)) === key);
    const groups = new Set<FoodGroup>();
    for (const m of ms) for (const g of groupsForFoodId(m.foodId, m.name)) groups.add(g);
    return {
      key,
      date,
      meals: ms,
      groups: GROUPS.filter((g) => groups.has(g)),
      slots: SLOTS.filter((s) => ms.some((m) => m.meal === s)),
      waterMl: water.filter((w) => dayKey(new Date(w.at)) === key).reduce((a, w) => a + w.ml, 0),
      foods: [...new Set(ms.map((m) => m.name))],
    };
  });
}

export interface GapReport {
  /** At least 3 days with something logged, so a pattern means something. */
  enough: boolean;
  loggedDays: number;
  rarely: { group: FoodGroup; seenDays: number }[];
}

/**
 * Food groups that show up rarely in what was LOGGED. This describes your log, not your body: it is never a
 * diagnosis, and a group you ate but did not log looks like a gap.
 */
export function gapReport(week: readonly DayInfo[], np: NutritionProfile): GapReport {
  const logged = week.filter((d) => d.meals.length > 0);
  const skipDairy = np.diets.includes('dairy_free') || np.diets.includes('vegan') || np.allergens.includes('milk');
  if (logged.length < 3) return { enough: false, loggedDays: logged.length, rarely: [] };
  const rarely = GROUPS.filter((g) => !(g === 'dairy' && skipDairy))
    .map((group) => ({ group, seenDays: logged.filter((d) => d.groups.includes(group)).length }))
    .filter((x) => x.seenDays / logged.length < 0.34);
  return { enough: true, loggedDays: logged.length, rarely };
}

/* ───────────── Workouts ───────────── */

export interface WorkoutContext {
  plannedToday: { minutes: number; focus: string } | null;
  doneToday: { endedAt: string; minutesAgo: number } | null;
}

export function workoutContext(plan: Plan | null, sessions: readonly SessionLog[], now: Date): WorkoutContext {
  const today = dayKey(now);
  const planned = plan?.schedule[todayIndex(now)] ?? null;
  const done = sessions
    .filter((s) => s.endedAt && dayKey(new Date(s.endedAt)) === today)
    .sort((a, b) => a.endedAt.localeCompare(b.endedAt))
    .at(-1);
  return {
    plannedToday: planned ? { minutes: Math.round(planned.estSeconds / 60), focus: planned.focus } : null,
    doneToday: done ? { endedAt: done.endedAt, minutesAgo: Math.max(0, Math.round((now.getTime() - new Date(done.endedAt).getTime()) / 60000)) } : null,
  };
}

/* ───────────── Before and after a workout ───────────── */

/**
 * Before training (AAP): mostly carbohydrate, moderate protein, little fat and fibre. The thresholds below
 * are this app's way of applying that sentence to a serving; they are a product choice, not figures from the page.
 */
export const fitsBefore = (f: { carbs: number; protein: number; fat: number; kcal: number; fiber: GuideFood['fiber'] }) =>
  f.carbs >= 20 && f.protein <= 15 && f.fat <= 10 && f.kcal <= 450 && f.fiber !== 'high';

/** After training (AAP): carbohydrate with protein. */
export const fitsAfter = (f: { carbs: number; protein: number }) => f.carbs >= 15 && f.protein >= 8;

/* ───────────── Goals, worded for the person's age ───────────── */

export interface GoalInfo {
  id: NutritionGoalId;
  label: string;
  blurb: string;
}

const GOALS: Record<NutritionGoalId, { adult: [string, string]; young: [string, string] }> = {
  performance: { adult: ['Improve athletic performance', 'Food that gives steady energy for training.'], young: ['Have energy to play and do sport', 'Food that gives steady energy for being active.'] },
  recovery: { adult: ['Support muscle recovery', 'Snacks with carbohydrate and protein after you train.'], young: ['Refuel after being active', 'A snack with carbohydrate and protein after sport or exercise.'] },
  balanced: { adult: ['Maintain balanced nutrition', 'Foods from every food group across the week.'], young: ['Eat a balanced mix of foods', 'Foods from every food group across the week.'] },
  hydration: { adult: ['Improve hydration', 'Regular drinks, and water-rich foods.'], young: ['Drink water regularly', 'Regular drinks, and water-rich foods.'] },
  variety: { adult: ['Eat a greater variety of nutritious foods', 'Try different foods and colours.'], young: ['Try more different foods', 'Try different foods and colours.'] },
  habits: { adult: ['Build consistent eating habits', 'Regular meals and snacks you can keep up.'], young: ['Build regular eating habits', 'Regular meals and snacks you can keep up.'] },
};

/** Goals offered at this age. Very young children get the everyday-habit goals only; sport and training goals start at 5. */
export function goalsForAge(ageYears: number): GoalInfo[] {
  const young = ageYears < 18;
  const ids = (Object.keys(GOALS) as NutritionGoalId[]).filter((id) => ageYears >= 5 || (id !== 'performance' && id !== 'recovery'));
  return ids.map((id) => ({ id, label: GOALS[id][young ? 'young' : 'adult'][0], blurb: GOALS[id][young ? 'young' : 'adult'][1] }));
}

export const goalLabel = (id: NutritionGoalId, ageYears: number) => GOALS[id][ageYears < 18 ? 'young' : 'adult'][0];

/* ───────────── Recommending ───────────── */

export type Want = Slot | 'pre' | 'post' | 'any';

export interface Recommendation {
  food: GuideFood;
  score: number;
  reasons: Reason[];
  before: boolean;
  after: boolean;
}

export interface ExcludedFood {
  food: GuideFood;
  why: Exclusion[];
}

export interface RecContext {
  ageYears: number;
  np: NutritionProfile;
  meals: readonly MealEntry[];
  water?: readonly WaterEntry[];
  workout: WorkoutContext;
  now: Date;
}

export interface RecResult {
  /** Set when nothing may be shown yet. */
  blocked: 'confirm_allergies' | null;
  picks: Recommendation[];
  excluded: ExcludedFood[];
  /** How many catalogue foods passed every safety rule for this person (before choosing a meal type). */
  eligible: number;
  gaps: GapReport;
}

/** A tiny stable number from text, so ties rotate from day to day but never change within a day. */
function jitter(id: string, day: string): number {
  let h = 2166136261;
  for (const c of `${id}|${day}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

const SRC = {
  dga: ['dga-2025'],
  aap: ['aap-sports-nutrition'],
  water: ['nasem-water', 'aap-sports-nutrition'],
  fda: ['fda-allergens'],
  fdc: ['usda-fdc'],
};

export function recommend(ctx: RecContext, want: Want = 'any', limit = 6): RecResult {
  const week = weekView(ctx.meals, ctx.water ?? [], ctx.now);
  const gaps = gapReport(week, ctx.np);
  if (!ctx.np.allergiesConfirmed) return { blocked: 'confirm_allergies', picks: [], excluded: [], eligible: 0, gaps };

  const excluded: ExcludedFood[] = [];
  const allowed: GuideFood[] = [];
  for (const food of GUIDE_FOODS) {
    const why = exclusions(food, ctx.np, ctx.ageYears);
    if (why.length) excluded.push({ food, why });
    else allowed.push(food);
  }

  const today = week[week.length - 1]!;
  const recent = new Set(week.flatMap((d) => d.foods.map((n) => n.toLowerCase())));
  const gapGroups = new Set(gaps.rarely.map((g) => g.group));
  const goals = new Set(ctx.np.goals);
  const dayStr = dayKey(ctx.now);
  const beforeSoon = !!ctx.workout.plannedToday && !ctx.workout.doneToday;
  const afterNow = !!ctx.workout.doneToday && ctx.workout.doneToday.minutesAgo <= 180;
  const missingSlot = (s: Slot) => !today.slots.includes(s);

  const scored: Recommendation[] = [];
  for (const food of allowed) {
    const before = fitsBefore(food);
    const after = fitsAfter(food);
    if (want === 'pre' && !before) continue;
    if (want === 'post' && !after) continue;
    if ((want === 'breakfast' || want === 'lunch' || want === 'dinner' || want === 'snack') && !food.slots.includes(want)) continue;
    if (want === 'any' && food.slots.length === 0) continue;

    const reasons: Reason[] = [];
    let score = 0;
    const add = (pts: number, text: string, sourceIds: string[]) => {
      score += pts;
      reasons.push({ text, sourceIds });
    };

    if (before && (want === 'pre' || (goals.has('performance') && (beforeSoon || want === 'any')))) {
      add(want === 'pre' || beforeSoon ? 3 : 1.5, 'Mostly carbohydrate with a little protein and little fat or fibre, which sits lightly before training.', SRC.aap);
    }
    if (after && (want === 'post' || (goals.has('recovery') && (afterNow || want === 'any')))) {
      add(want === 'post' || afterNow ? 3 : 1.5, 'Carbohydrate with protein, a good mix to refuel after training.', SRC.aap);
    }
    if (goals.has('balanced') && food.groups.length >= 2) {
      add(2, `Combines ${food.groups.length} food groups (${food.groups.map((g) => GROUP_LABEL[g].toLowerCase()).join(', ')}) in one choice.`, SRC.dga);
    }
    if (goals.has('hydration') && (food.waterRich || food.isDrink)) {
      add(2.5, food.isDrink ? 'A drink, so it counts towards your fluids.' : 'A water-rich food: about 20% of the water most people take in comes from food.', SRC.water);
    }
    if (goals.has('variety') && !recent.has(food.name.toLowerCase())) {
      add(2, 'Not in your log this week, so it adds something new.', SRC.dga);
    }
    const fills = food.groups.filter((g) => gapGroups.has(g));
    if (fills.length) {
      add(Math.min(4, 2 * fills.length), `You have logged ${fills.map((g) => GROUP_LABEL[g].toLowerCase()).join(' and ')} on only a few days this week, and this has ${fills.length > 1 ? 'them' : 'it'}.`, SRC.dga);
    }
    if (goals.has('habits')) {
      const slot = (['breakfast', 'lunch', 'dinner'] as Slot[]).find((s) => food.slots.includes(s) && missingSlot(s) && (want === 'any' || want === s));
      if (slot) add(2, `You have not logged ${slot} yet today, and this is a simple one.`, SRC.dga);
      else if (food.ingredients.length <= 4) add(1, 'Simple, with few ingredients, so it is easy to repeat.', SRC.dga);
    }
    const likes = likedWords(food, ctx.np);
    if (likes.length) add(2, `You said you like ${likes[0]}.`, []);

    if (reasons.length === 0) {
      const g = food.groups[0];
      add(0.2, g ? `A simple everyday choice from the ${GROUP_LABEL[g].toLowerCase()} group.` : 'A simple everyday choice.', SRC.dga);
    }
    scored.push({ food, score: score + jitter(food.id, dayStr) * 0.9, reasons, before, after });
  }

  scored.sort((a, b) => b.score - a.score || a.food.id.localeCompare(b.food.id));
  return { blocked: null, picks: scored.slice(0, limit), excluded, eligible: allowed.length, gaps };
}

/** Same-group foods that DO meet this person's needs, to offer in place of one that does not. */
export function alternativesFor(food: { groups: FoodGroup[]; slots?: Slot[]; id?: string }, ctx: RecContext, limit = 3): GuideFood[] {
  if (!ctx.np.allergiesConfirmed) return [];
  // A treat belongs to no food group, so offer simple snack ideas that fit the profile instead.
  if (food.groups.length === 0) return recommend(ctx, 'snack', limit).picks.map((p) => p.food);
  const wantGroups = new Set(food.groups);
  return GUIDE_FOODS.filter((f) => f.id !== food.id && f.slots.length > 0 && exclusions(f, ctx.np, ctx.ageYears).length === 0 && f.groups.some((g) => wantGroups.has(g)))
    .map((f) => ({ f, score: f.groups.filter((g) => wantGroups.has(g)).length + jitter(f.id, dayKey(ctx.now)) * 0.5 }))
    .sort((a, b) => b.score - a.score || a.f.id.localeCompare(b.f.id))
    .slice(0, limit)
    .map((x) => x.f);
}

/** Show calorie and macro numbers? Never for under-18s, and never when the person has switched them off. */
export const showNumbers = (ageYears: number, hideSetting: boolean) => ageYears >= 18 && !hideSetting;
