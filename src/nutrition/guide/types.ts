/**
 * Types for the food guide: allergens, diets, food groups, goals and what a person tells us about
 * their eating. Everything here is plain data. Nothing is sent anywhere.
 */

/** The nine major U.S. food allergens (FDA). Sesame joined the list in 2023. */
export const ALLERGENS = ['milk', 'egg', 'fish', 'shellfish', 'tree_nuts', 'peanuts', 'wheat', 'soy', 'sesame'] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const ALLERGEN_LABEL: Record<Allergen, string> = {
  milk: 'Milk',
  egg: 'Egg',
  fish: 'Fish',
  shellfish: 'Shellfish (crab, shrimp, lobster)',
  tree_nuts: 'Tree nuts (almond, walnut, cashew…)',
  peanuts: 'Peanuts',
  wheat: 'Wheat',
  soy: 'Soy',
  sesame: 'Sesame',
};

export const DIETS = ['vegetarian', 'vegan', 'pescatarian', 'dairy_free', 'gluten_free'] as const;
export type Diet = (typeof DIETS)[number];

export const DIET_LABEL: Record<Diet, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  pescatarian: 'Pescatarian (fish, no meat)',
  dairy_free: 'Dairy-free',
  gluten_free: 'Gluten-free',
};

/** The five food groups used in U.S. guidance. Foods can belong to several (a sandwich is grain and protein). */
export const GROUPS = ['fruit', 'vegetable', 'grain', 'protein', 'dairy'] as const;
export type FoodGroup = (typeof GROUPS)[number];

export const GROUP_LABEL: Record<FoodGroup, string> = {
  fruit: 'Fruits',
  vegetable: 'Vegetables',
  grain: 'Grains',
  protein: 'Protein foods',
  dairy: 'Dairy & alternatives',
};

export const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type Slot = (typeof SLOTS)[number];

export const NUTRITION_GOALS = ['performance', 'recovery', 'balanced', 'hydration', 'variety', 'habits'] as const;
export type NutritionGoalId = (typeof NUTRITION_GOALS)[number];

/** What a person tells us about their eating. Optional and editable at any time. */
export interface NutritionProfile {
  /**
   * The person has looked at the allergy question and answered it (even if the answer is "none").
   * Food ideas are not shown until this is true, so a skipped question can never look like "no allergies".
   */
  allergiesConfirmed: boolean;
  allergens: Allergen[];
  /** Allergies or foods to avoid that are not in the nine major allergens, typed in the person's own words. */
  otherAllergens: string[];
  diets: Diet[];
  /** Foods or words the person likes and dislikes (matched against food and ingredient names). */
  likes: string[];
  dislikes: string[];
  goals: NutritionGoalId[];
  /** A drink-counter habit target in cups (8 fl oz). Optional, never a medical target. */
  waterTargetCups: number;
  updatedAt: string;
}

/** One logged drink of water. Stored in millilitres. */
export interface WaterEntry {
  id: string;
  at: string;
  ml: number;
}

export const CUP_ML = 237;
export const WATER_TARGET = { min: 2, max: 16, start: 6 } as const;

/** A suggestion, explanation or caution, with the sources it comes from. */
export interface Reason {
  text: string;
  sourceIds: string[];
}
