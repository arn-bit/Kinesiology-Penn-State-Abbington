import { describe, expect, it } from 'vitest';
import { getEvidence } from '../../domain/evidence/registry';
import type { SessionLog } from '../../domain/types';
import { ALL_FOODS, type MealEntry } from '../foods';
import { sanitize, defaultData } from '../../state/storage';
import { GUIDE_FOODS, INGREDIENTS, MEAL_DEFS, ingredient, type GuideFood } from './catalog';
import { alternativesFor, fitsAfter, fitsBefore, gapReport, goalsForAge, lastDays, recommend, showNumbers, weekView, dayKey, type RecContext, type WorkoutContext } from './engine';
import { answerTopic, coachTips, goalProgress, matchTopic, TOPICS, weeklyRecap, type CoachContext } from './coach';
import { allergenHints, groupsForFoodId } from './logged';
import { emptyNutritionProfile, normalizeNutritionProfile, normalizeWater } from './profile';
import { exclusions, typedTerm } from './rules';
import { ALLERGENS, DIETS, GROUPS, NUTRITION_GOALS, type Allergen, type Diet, type NutritionProfile } from './types';

const NOW = new Date(2026, 10, 4, 9, 30); // a Wednesday morning
const NO_WORKOUT: WorkoutContext = { plannedToday: null, doneToday: null };

const profile = (over: Partial<NutritionProfile> = {}): NutritionProfile => ({ ...emptyNutritionProfile(NOW), allergiesConfirmed: true, ...over });
const ctx = (np: NutritionProfile, over: Partial<RecContext> = {}): RecContext => ({ ageYears: 30, np, meals: [], water: [], workout: NO_WORKOUT, now: NOW, ...over });
const coachCtx = (np: NutritionProfile, over: Partial<CoachContext> = {}): CoachContext => ({ ...ctx(np), sessions: [], condition: false, pregnantOrPostpartum: false, ...over });

const meal = (daysAgo: number, foodId: string, name: string, slot: MealEntry['meal'] = 'lunch', extra: Partial<MealEntry> = {}): MealEntry => ({
  id: `m${daysAgo}${foodId}${slot}`,
  at: new Date(2026, 10, 4 - daysAgo, 12).toISOString(),
  meal: slot,
  name,
  servings: 1,
  kcal: 200,
  protein: 5,
  carbs: 30,
  fat: 5,
  source: 'search',
  foodId,
  ...extra,
});

/** Independent restatement of each diet, so the engine is not tested against itself. */
const DIET_OK: Record<Diet, (f: GuideFood) => boolean> = {
  vegetarian: (f) => !f.meat && !f.seafood,
  vegan: (f) => !f.meat && !f.seafood && !f.dairy && !f.egg && !f.honey,
  pescatarian: (f) => !f.meat,
  dairy_free: (f) => !f.dairy && !f.allergens.includes('milk'),
  gluten_free: (f) => !f.gluten && !f.oats,
};

describe('catalogue', () => {
  it('has unique ids and sensible numbers', () => {
    const ids = [...GUIDE_FOODS, ...INGREDIENTS].map((f) => f.id);
    expect(new Set([...GUIDE_FOODS].map((f) => f.id)).size).toBe(GUIDE_FOODS.length);
    expect(ids.length).toBeGreaterThan(60);
    for (const f of GUIDE_FOODS) {
      for (const n of [f.kcal, f.protein, f.carbs, f.fat]) expect(n, f.id).toBeGreaterThanOrEqual(0);
      // Energy should roughly match the macros (4/4/9 kcal per gram): catches typos in the tables.
      const est = 4 * f.protein + 4 * f.carbs + 9 * f.fat;
      expect(Math.abs(f.kcal - est), `${f.id} ${f.kcal} vs ${est}`).toBeLessThanOrEqual(Math.max(25, f.kcal * 0.2));
      expect(f.slots.length, f.id).toBeGreaterThan(0);
    }
  });

  it('meals are derived from their parts: totals, allergens and diet flags cannot disagree', () => {
    for (const m of MEAL_DEFS) {
      const meal = GUIDE_FOODS.find((f) => f.id === m.id)!;
      const parts = m.parts.map(([id, s]) => ({ f: ingredient(id), s }));
      expect(meal.kcal, m.id).toBe(Math.round(parts.reduce((a, p) => a + p.f.kcal * p.s, 0)));
      for (const p of parts) {
        for (const a of p.f.allergens) expect(meal.allergens, `${m.id} ${a}`).toContain(a);
        if (p.f.meat) expect(meal.meat).toBe(true);
        if (p.f.dairy) expect(meal.dairy).toBe(true);
        if (p.f.gluten) expect(meal.gluten).toBe(true);
        if (p.f.choking) expect(meal.choking).toBe(true);
        for (const g of p.f.groups) expect(meal.groups).toContain(g);
      }
      expect(meal.mayContain.some((a) => meal.allergens.includes(a))).toBe(false);
    }
  });

  it('known allergen facts are right', () => {
    const f = (id: string) => GUIDE_FOODS.find((x) => x.id === id)!;
    expect(f('apple_pb').allergens).toContain('peanuts');
    expect(f('hummus').allergens).toContain('sesame');
    expect(f('tuna_sandwich').allergens).toEqual(expect.arrayContaining(['fish', 'wheat']));
    expect(f('shrimp_pasta').allergens).toEqual(expect.arrayContaining(['shellfish', 'wheat']));
    expect(f('tofu_stir_fry').allergens).toContain('soy');
    expect(f('oats_berries_walnuts').allergens).toContain('tree_nuts');
    expect(f('egg_orange').allergens).toContain('egg');
    expect(f('apple').allergens).toEqual([]);
  });
});

describe('typed allergies', () => {
  it('maps common words to the major allergens, conservatively', () => {
    expect(typedTerm('Casein')?.allergens).toEqual(['milk']);
    expect(typedTerm('shrimp')?.allergens).toEqual(['shellfish']);
    expect(typedTerm('nuts')?.allergens.sort()).toEqual(['peanuts', 'tree_nuts']);
    expect(typedTerm('gluten')?.gluten).toBe(true);
    expect(typedTerm('kiwi')?.allergens).toEqual([]);
    expect(typedTerm('x')).toBeNull();
    expect(typedTerm('a'.repeat(60))).toBeNull();
  });

  it('leaves out foods that mention an unlisted allergen, and everything that contains a mapped one', () => {
    const np = profile({ otherAllergens: ['kiwi', 'casein'] });
    const r = recommend(ctx(np), 'any', 500);
    expect(r.picks.some((p) => p.food.id === 'kiwi')).toBe(false);
    expect(r.picks.every((p) => !p.food.allergens.includes('milk') && !p.food.mayContain.includes('milk'))).toBe(true);
  });
});

describe('recommendation safety matrix', () => {
  const ages = [3, 8, 15, 30, 70];

  it('never suggests a food containing, or likely to contain, an allergen the person avoids', () => {
    for (const a of ALLERGENS) {
      for (const age of ages) {
        const r = recommend(ctx(profile({ allergens: [a] }), { ageYears: age }), 'any', 500);
        expect(r.picks.length, `${a} age ${age}`).toBeGreaterThan(5);
        for (const p of r.picks) {
          expect(p.food.allergens, `${p.food.id} for ${a}`).not.toContain(a);
          expect(p.food.mayContain, `${p.food.id} for ${a}`).not.toContain(a);
        }
        expect(r.excluded.length).toBeGreaterThan(0);
        expect(r.picks.length + r.excluded.length).toBe(GUIDE_FOODS.filter((f) => f.slots.length > 0).length);
      }
    }
  });

  it('respects every diet, alone and with every allergen', () => {
    for (const d of DIETS) {
      for (const a of [undefined, ...ALLERGENS] as (Allergen | undefined)[]) {
        const np = profile({ diets: [d], allergens: a ? [a] : [] });
        for (const want of ['any', 'breakfast', 'lunch', 'dinner', 'snack', 'pre', 'post'] as const) {
          const r = recommend(ctx(np), want, 500);
          for (const p of r.picks) {
            expect(DIET_OK[d](p.food), `${p.food.id} for ${d}/${a}/${want}`).toBe(true);
            if (a) expect([...p.food.allergens, ...p.food.mayContain]).not.toContain(a);
          }
        }
      }
    }
  });

  it('handles every goal with every diet and gives each suggestion at least one reason with real sources', () => {
    for (const g of NUTRITION_GOALS) {
      for (const d of [undefined, ...DIETS] as (Diet | undefined)[]) {
        const np = profile({ goals: [g], diets: d ? [d] : [] });
        const r = recommend(ctx(np, { workout: { plannedToday: { minutes: 30, focus: 'x' }, doneToday: null } }), 'any', 8);
        expect(r.picks.length, `${g}/${d}`).toBeGreaterThan(0);
        for (const p of r.picks) {
          expect(p.reasons.length).toBeGreaterThan(0);
          for (const reason of p.reasons) for (const id of reason.sourceIds) expect(getEvidence(id), `${id} (${p.food.id})`).toBeDefined();
        }
      }
    }
  });

  it('combines several allergies and a diet: nothing unsafe survives, and there is still honest output', () => {
    const np = profile({ allergens: ['milk', 'egg', 'peanuts', 'tree_nuts', 'wheat', 'soy', 'sesame'], diets: ['vegan'] });
    const r = recommend(ctx(np), 'any', 500);
    expect(r.picks.length).toBeGreaterThan(0);
    for (const p of r.picks) {
      expect(p.food.allergens.some((a) => np.allergens.includes(a))).toBe(false);
      expect(p.food.mayContain.some((a) => np.allergens.includes(a))).toBe(false);
      expect(DIET_OK.vegan(p.food)).toBe(true);
    }
    // Avoiding everything in the catalogue leaves nothing, and says so rather than inventing something.
    const all = profile({ allergens: [...ALLERGENS], diets: ['vegan'], otherAllergens: ['fruit', 'vegetable', 'rice', 'bean', 'lentil', 'carrot', 'cucumber', 'water', 'corn', 'potato', 'quinoa', 'tomato', 'pepper', 'broccoli', 'pop', 'avocado', 'oat', 'raisin', 'apple'] });
    expect(recommend(ctx(all), 'any', 50).picks.length).toBeLessThan(recommend(ctx(np), 'any', 500).picks.length);
  });

  it('keeps choking hazards away from children under 5', () => {
    const r = recommend(ctx(profile(), { ageYears: 3 }), 'any', 500);
    expect(r.picks.length).toBeGreaterThan(5);
    expect(r.picks.every((p) => !p.food.choking)).toBe(true);
    expect(recommend(ctx(profile(), { ageYears: 30 }), 'any', 500).picks.some((p) => p.food.choking)).toBe(true);
  });

  it('leaves out disliked foods and lifts liked ones', () => {
    const r = recommend(ctx(profile({ dislikes: ['banana'] })), 'any', 500);
    expect(r.picks.some((p) => p.food.ingredients.some((i) => i.includes('banana')))).toBe(false);
    const liked = recommend(ctx(profile({ likes: ['salmon'] })), 'any', 3);
    expect(liked.picks[0]!.food.id).toBe('salmon_sweet_potato');
    expect(liked.picks[0]!.reasons.some((x) => /like salmon/.test(x.text))).toBe(true);
  });

  it('shows nothing until the allergy question has been answered', () => {
    const r = recommend(ctx(profile({ allergiesConfirmed: false })), 'any', 10);
    expect(r.blocked).toBe('confirm_allergies');
    expect(r.picks).toEqual([]);
    expect(alternativesFor({ groups: ['dairy'] }, ctx(profile({ allergiesConfirmed: false })))).toEqual([]);
    const tips = coachTips(coachCtx(profile({ allergiesConfirmed: false })));
    expect(tips).toHaveLength(1);
    expect(tips[0]!.id).toBe('allergies');
  });

  it('is deterministic for a day and varies across days', () => {
    const a = recommend(ctx(profile({ goals: ['variety'] })), 'any', 6).picks.map((p) => p.food.id);
    const b = recommend(ctx(profile({ goals: ['variety'] })), 'any', 6).picks.map((p) => p.food.id);
    expect(a).toEqual(b);
    const later = Array.from({ length: 6 }, (_, i) => recommend(ctx(profile({ goals: ['variety'] }), { now: new Date(2026, 10, 5 + i, 9) }), 'any', 6).picks.map((p) => p.food.id).join());
    expect(new Set([a.join(), ...later]).size).toBeGreaterThan(1);
  });

  it('offers before-workout and after-workout foods that really fit', () => {
    const np = profile();
    for (const p of recommend(ctx(np), 'pre', 50).picks) expect(fitsBefore(p.food)).toBe(true);
    for (const p of recommend(ctx(np), 'post', 50).picks) expect(fitsAfter(p.food)).toBe(true);
    expect(recommend(ctx(np), 'pre', 50).picks.length).toBeGreaterThan(3);
    expect(recommend(ctx(np), 'post', 50).picks.length).toBeGreaterThan(3);
    expect(recommend(ctx(profile({ allergens: ['milk'] })), 'post', 50).picks.some((p) => p.food.id === 'chocolate_milk')).toBe(false);
    expect(recommend(ctx(np), 'breakfast', 50).picks.every((p) => p.food.slots.includes('breakfast'))).toBe(true);
  });

  it('prefers pre-workout food on a workout day for someone focused on performance', () => {
    const r = recommend(ctx(profile({ goals: ['performance'] }), { workout: { plannedToday: { minutes: 30, focus: 'x' }, doneToday: null } }), 'any', 5);
    expect(r.picks.every((p) => p.before)).toBe(true);
    expect(r.picks[0]!.reasons[0]!.sourceIds).toContain('aap-sports-nutrition');
  });

  it('suggests alternatives from the same group that meet the person’s needs', () => {
    const np = profile({ allergens: ['milk'], diets: ['vegan'] });
    const alts = alternativesFor({ groups: ['dairy'], id: 'milk' }, ctx(np));
    expect(alts.length).toBeGreaterThan(0);
    for (const f of alts) {
      expect(f.groups).toContain('dairy');
      expect(exclusions(f, np, 30)).toEqual([]);
    }
  });

  it('never calls anything safe, hypoallergenic or guaranteed', () => {
    const np = profile({ allergens: ['peanuts'], goals: [...NUTRITION_GOALS] });
    const text: string[] = [];
    const r = recommend(ctx(np), 'any', 500);
    for (const p of r.picks) text.push(...p.reasons.map((x) => x.text));
    for (const e of r.excluded) text.push(...e.why.map((x) => x.text));
    for (const t of coachTips(coachCtx(np, { workout: { plannedToday: { minutes: 70, focus: 'x' }, doneToday: null } }))) text.push(t.title, t.body);
    for (const t of TOPICS) {
      const a = answerTopic(t.id, coachCtx(np));
      text.push(a.title, ...a.paragraphs);
    }
    expect(text.join('\n')).not.toMatch(/allergy[- ]safe|hypoallergenic|safe for you|100% safe|guaranteed|safe to eat|cure|diagnos[ei]/i);
  });
});

describe('your log: food groups and gaps', () => {
  it('reads food groups from guide foods and from the main food list', () => {
    expect(groupsForFoodId('guide:apple')).toEqual(['fruit']);
    expect(groupsForFoodId('guide:eggs_toast')).toEqual(expect.arrayContaining(['protein', 'grain']));
    expect(groupsForFoodId('pizza', 'Pizza')).toEqual(expect.arrayContaining(['grain']));
    expect(groupsForFoodId('apple_pie', 'Apple pie')).toEqual([]);
    expect(groupsForFoodId('french_fries', 'French fries')).toEqual([]);
    expect(groupsForFoodId('apple', 'Apple')).toEqual(['fruit']);
    expect(groupsForFoodId('peanuts', 'Peanuts')).toContain('protein');
    expect(groupsForFoodId(undefined)).toEqual([]);
    const withGroup = ALL_FOODS.filter((f) => groupsForFoodId(f.id, f.name).length > 0).length;
    expect(withGroup / ALL_FOODS.length).toBeGreaterThan(0.5);
  });

  it('only ever WARNS about allergens in logged dishes, from the name', () => {
    expect(allergenHints('Cheesecake', 'cheesecake')).toEqual(expect.arrayContaining(['milk', 'egg', 'wheat']));
    expect(allergenHints('Pad thai', 'pad_thai')).toEqual(expect.arrayContaining(['peanuts', 'shellfish', 'egg']));
    expect(allergenHints('Apple', 'apple')).toEqual([]);
    expect(allergenHints('Hummus plate', 'guide:hummus_veg_plate')).toContain('sesame');
  });

  it('builds a seven-day picture with the right days, groups and drinks', () => {
    expect(lastDays(NOW, 7)).toHaveLength(7);
    expect(dayKey(lastDays(NOW, 7)[6]!)).toBe(dayKey(NOW));
    const meals = [meal(0, 'guide:apple', 'Apple', 'snack'), meal(0, 'guide:chicken_rice_broccoli', 'Chicken, brown rice and broccoli', 'dinner'), meal(3, 'guide:yogurt', 'Plain yogurt', 'breakfast')];
    const water = [{ id: 'w1', at: new Date(2026, 10, 4, 8).toISOString(), ml: 474 }];
    const wk = weekView(meals, water, NOW);
    expect(wk[6]!.groups).toEqual(expect.arrayContaining(['fruit', 'protein', 'grain', 'vegetable']));
    expect(wk[6]!.slots).toEqual(['dinner', 'snack']);
    expect(wk[6]!.waterMl).toBe(474);
    expect(wk[3]!.groups).toEqual(['dairy']);
    expect(wk[0]!.meals).toEqual([]);
  });

  it('only talks about gaps once there are enough logged days, and never for a diet that excludes the group', () => {
    const few = weekView([meal(0, 'guide:apple', 'Apple')], [], NOW);
    expect(gapReport(few, profile()).enough).toBe(false);
    const meals = [0, 1, 2, 3].flatMap((d) => [meal(d, 'guide:apple', 'Apple', 'snack'), meal(d, 'guide:egg_orange', 'Hard-boiled egg and an orange', 'lunch')]);
    const wk = weekView(meals, [], NOW);
    const g = gapReport(wk, profile());
    expect(g.enough).toBe(true);
    const rare = g.rarely.map((x) => x.group);
    expect(rare).toEqual(expect.arrayContaining(['vegetable', 'grain', 'dairy']));
    expect(gapReport(wk, profile({ diets: ['vegan'] })).rarely.map((x) => x.group)).not.toContain('dairy');
    expect(gapReport(wk, profile({ allergens: ['milk'] })).rarely.map((x) => x.group)).not.toContain('dairy');
  });

  it('suggests foods that fill a rare group', () => {
    const meals = [0, 1, 2, 3].flatMap((d) => [meal(d, 'guide:apple', 'Apple', 'snack')]);
    const r = recommend(ctx(profile(), { meals }), 'any', 5);
    expect(r.gaps.rarely.map((x) => x.group)).toContain('vegetable');
    expect(r.picks.some((p) => p.reasons.some((x) => /on only a few days/.test(x.text)))).toBe(true);
  });
});

describe('goals, age and numbers', () => {
  it('words goals for the age, and keeps sport goals for ages 5 and up', () => {
    expect(goalsForAge(3).map((g) => g.id)).toEqual(['balanced', 'hydration', 'variety', 'habits']);
    expect(goalsForAge(10).map((g) => g.id)).toHaveLength(6);
    expect(goalsForAge(10).find((g) => g.id === 'performance')!.label).toMatch(/energy to play/);
    expect(goalsForAge(30).find((g) => g.id === 'performance')!.label).toBe('Improve athletic performance');
    for (const age of [3, 8, 15, 30, 70]) {
      for (const g of goalsForAge(age)) expect(`${g.label} ${g.blurb}`).not.toMatch(/weight|lose|calorie|diet\b|burn|slim|lean/i);
    }
  });

  it('hides calorie numbers for under-18s and when switched off', () => {
    expect(showNumbers(10, false)).toBe(false);
    expect(showNumbers(17, false)).toBe(false);
    expect(showNumbers(18, false)).toBe(true);
    expect(showNumbers(40, true)).toBe(false);
  });

  it('tracks progress towards each chosen goal', () => {
    const meals = [meal(0, 'guide:apple', 'Apple', 'snack'), meal(0, 'guide:yogurt', 'Plain yogurt', 'breakfast'), meal(1, 'guide:banana', 'Banana', 'snack')];
    const water = [{ id: 'w', at: new Date(2026, 10, 4, 8).toISOString(), ml: 237 * 6 }];
    const prog = goalProgress(coachCtx(profile({ goals: ['hydration', 'variety', 'habits', 'balanced'], waterTargetCups: 6 }), { meals, water }));
    expect(prog.map((p) => p.id)).toEqual(['hydration', 'variety', 'habits', 'balanced']);
    expect(prog[0]!.value).toBe(6);
    expect(prog[0]!.detail).toMatch(/1 of the last 7 days/);
    expect(prog[1]!.value).toBe(3);
    for (const p of prog) {
      expect(p.target).toBeGreaterThan(0);
      expect(p.value).toBeGreaterThanOrEqual(0);
    }
  });

  it('checks that food was logged after a workout for the recovery goal', () => {
    const session: SessionLog = { id: 's', plannedSessionId: 'p', startedAt: new Date(2026, 10, 4, 7).toISOString(), endedAt: new Date(2026, 10, 4, 8).toISOString(), activeSeconds: 1500, sets: [], completedExerciseIds: [], rpe: 5, note: '', endedReason: 'completed' };
    const snack = meal(0, 'guide:chocolate_milk', 'Chocolate milk', 'snack', { carbs: 30, protein: 8, at: new Date(2026, 10, 4, 8, 30).toISOString() });
    const prog = goalProgress(coachCtx(profile({ goals: ['recovery'] }), { sessions: [session], meals: [snack] }));
    expect(prog[0]!.value).toBe(1);
    const none = goalProgress(coachCtx(profile({ goals: ['recovery'] }), { sessions: [session], meals: [] }));
    expect(none[0]!.value).toBe(0);
  });
});

describe('coach', () => {
  it('gives workout-aware tips that respect the profile', () => {
    const np = profile({ allergens: ['milk', 'peanuts'], goals: ['performance'] });
    const pre = coachTips(coachCtx(np, { workout: { plannedToday: { minutes: 30, focus: 'x' }, doneToday: null } })).find((t) => t.id === 'pre')!;
    expect(pre.foodIds!.length).toBeGreaterThan(0);
    for (const id of pre.foodIds!) expect(exclusions(GUIDE_FOODS.find((f) => f.id === id)!, np, 30)).toEqual([]);
    const post = coachTips(coachCtx(np, { workout: { plannedToday: null, doneToday: { endedAt: NOW.toISOString(), minutesAgo: 20 } } })).find((t) => t.id === 'post')!;
    expect(post.body).toMatch(/20 minutes ago|Within the next hour/);
    expect(coachTips(coachCtx(np)).some((t) => t.id === 'pre' || t.id === 'post')).toBe(false);
  });

  it('points people with a condition or pregnancy to a professional', () => {
    const t = coachTips(coachCtx(profile(), { condition: true }));
    expect(t.some((x) => x.id === 'clinician' && x.sourceIds.includes('academy-sports-rdn'))).toBe(true);
    expect(coachTips(coachCtx(profile(), { pregnantOrPostpartum: true })).some((x) => x.id === 'clinician')).toBe(true);
  });

  it('answers each fixed topic with sources and never invents an answer for something else', () => {
    for (const t of TOPICS) {
      const a = answerTopic(t.id, coachCtx(profile({ allergens: ['egg'] })));
      expect(a.paragraphs.length).toBeGreaterThan(0);
      expect(a.sourceIds.length).toBeGreaterThan(0);
      for (const id of a.sourceIds) expect(getEvidence(id)).toBeDefined();
      expect(matchTopic(t.question)).toBe(t.id);
    }
    expect(matchTopic('what about creatine powder')).toBe('drinks');
    expect(matchTopic('qwxz plugh')).toBeNull();
    expect(matchTopic('')).toBeNull();
  });

  it('explains hydration without a made-up glasses-a-day rule', () => {
    const a = answerTopic('water', coachCtx(profile({ waterTargetCups: 7 })));
    const text = a.paragraphs.join(' ');
    expect(text).toMatch(/no official/i);
    expect(text).toMatch(/7 cups/);
    expect(a.sourceIds).toContain('nasem-water');
  });

  it('summarises the week', () => {
    const lines = weeklyRecap(coachCtx(profile(), { meals: [meal(0, 'guide:apple', 'Apple')] }));
    expect(lines[0]).toMatch(/1 of the last 7 days/);
  });
});

describe('saved data is validated', () => {
  it('drops unknown or malformed nutrition data and clamps numbers', () => {
    const n = normalizeNutritionProfile({
      allergiesConfirmed: 'yes',
      allergens: ['milk', 'dragonfruit', 42, 'milk'],
      otherAllergens: ['  kiwi ', '<script>alert(1)</script>'.repeat(5), 'x', 5],
      diets: ['vegan', 'carnivore'],
      likes: new Array(50).fill('apple'),
      goals: ['hydration', 'weight_loss'],
      waterTargetCups: 9999,
      updatedAt: 'not a date',
    })!;
    expect(n.allergiesConfirmed).toBe(false); // only a real `true` counts
    expect(n.allergens).toEqual(['milk']);
    expect(n.otherAllergens[0]).toBe('kiwi');
    expect(n.otherAllergens.every((x) => x.length <= 40)).toBe(true);
    expect(n.diets).toEqual(['vegan']);
    expect(n.likes).toEqual(['apple']);
    expect(n.goals).toEqual(['hydration']);
    expect(n.waterTargetCups).toBe(16);
    expect(Number.isNaN(Date.parse(n.updatedAt))).toBe(false);
    expect(normalizeNutritionProfile('nope')).toBeNull();
    expect(normalizeNutritionProfile({ waterTargetCups: -3 })!.waterTargetCups).toBe(2);
  });

  it('cleans the water log', () => {
    const w = normalizeWater([{ id: 'a', at: '2026-11-04T08:00:00.000Z', ml: 250 }, { id: 'b', at: 'bad', ml: 1 }, { id: 'c', at: '2026-11-04T08:00:00.000Z', ml: 999999 }, null, 'x']);
    expect(w.map((x) => x.id)).toEqual(['a', 'c']);
    expect(w[1]!.ml).toBe(3000);
  });

  it('round-trips through app storage and is part of every saved file', () => {
    const d = defaultData();
    expect(d.nutrition).toBeNull();
    expect(d.water).toEqual([]);
    const np = profile({ allergens: ['soy'] });
    const back = sanitize(JSON.parse(JSON.stringify({ ...d, nutrition: np, water: [{ id: 'w', at: NOW.toISOString(), ml: 237 }] })))!;
    expect(back.nutrition!.allergens).toEqual(['soy']);
    expect(back.water).toHaveLength(1);
    const old = sanitize({ version: 1 })!; // a save from before this feature
    expect(old.nutrition).toBeNull();
    expect(GROUPS).toHaveLength(5);
  });
});
