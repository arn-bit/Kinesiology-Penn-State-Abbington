import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../../../state/store';
import { workoutContext, showNumbers, type RecContext } from '../../../nutrition/guide/engine';
import type { CoachContext } from '../../../nutrition/guide/coach';
import { emptyNutritionProfile } from '../../../nutrition/guide/profile';
import type { NutritionProfile } from '../../../nutrition/guide/types';
import { scaleFood, type MealEntry } from '../../../nutrition/foods';
import type { GuideFood } from '../../../nutrition/guide/catalog';
import type { Slot } from '../../../nutrition/guide/types';

/** The current time, refreshed every minute so "today" and "after your workout" stay right while the page is open. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export const slotNow = (d: Date = new Date()): Slot => {
  const h = d.getHours();
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
};

export const slotLabel = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** A meal-log entry for one serving (or more) of a guide food. */
export function mealEntryFor(food: GuideFood, servings: number, slot: Slot, at: Date = new Date()): MealEntry {
  const n = scaleFood(food, servings);
  return { id: `m-${at.getTime()}-${Math.random().toString(36).slice(2, 7)}`, at: at.toISOString(), meal: slot, name: food.name, servings, ...n, source: 'search', foodId: `guide:${food.id}` };
}

/** Everything the nutrition tabs need, assembled from the store in one place. */
export function useGuide() {
  const store = useStore();
  const { data } = store;
  const profile = data.profile!;
  const now = useNow();
  const np = useMemo(() => data.nutrition ?? emptyNutritionProfile(), [data.nutrition]);
  const workout = useMemo(() => workoutContext(data.plan, data.sessions, now), [data.plan, data.sessions, now]);
  const rec: RecContext = useMemo(() => ({ ageYears: profile.ageYears, np, meals: data.meals, water: data.water, workout, now }), [profile.ageYears, np, data.meals, data.water, workout, now]);
  const coach: CoachContext = useMemo(
    () => ({
      ...rec,
      sessions: data.sessions,
      condition: profile.health.knownCardioMetabolicRenal,
      pregnantOrPostpartum: profile.health.pregnancy === 'pregnant' || profile.health.pregnancy === 'postpartum',
    }),
    [rec, data.sessions, profile.health.knownCardioMetabolicRenal, profile.health.pregnancy],
  );
  const numbers = showNumbers(profile.ageYears, data.settings.hideNutritionNumbers);

  /** Save a change to the food profile straight away, so preferences can be updated at any time. */
  const save = useCallback(
    (patch: Partial<NutritionProfile>) => {
      store.setNutrition({ ...np, ...patch, updatedAt: new Date().toISOString() });
    },
    [store, np],
  );

  return { store, data, profile, np, now, workout, rec, coach, numbers, save, hasProfile: data.nutrition !== null };
}
