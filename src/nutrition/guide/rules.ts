import type { GuideFood } from './catalog';
import { ALLERGEN_LABEL, DIET_LABEL, type Allergen, type Diet, type NutritionProfile } from './types';

/**
 * Safety rules for the food guide. These run BEFORE any scoring: a food that fails any rule is never
 * suggested, however well it fits a goal. Pure, deterministic and unit-tested against every allergen,
 * diet and age band. Nothing here "certifies" a food as safe; it only decides what we leave out.
 */

export type ExclusionCode = 'allergen' | 'may_contain' | 'typed' | 'diet' | 'dislike' | 'age';

export interface Exclusion {
  code: ExclusionCode;
  text: string;
  sourceIds: string[];
}

/** Words people type for allergies, mapped to the major allergens (conservative: "nuts" means all nuts and peanuts). */
const SYNONYMS: { allergen?: Allergen; gluten?: boolean; words: string[] }[] = [
  { allergen: 'milk', words: ['milk', 'dairy', 'lactose', 'casein', 'whey', 'cheese', 'butter', 'yogurt', 'yoghurt', 'cream'] },
  { allergen: 'egg', words: ['egg', 'eggs', 'albumin'] },
  { allergen: 'fish', words: ['fish', 'salmon', 'tuna', 'cod', 'anchovy', 'anchovies', 'sardine', 'sardines'] },
  { allergen: 'shellfish', words: ['shellfish', 'shrimp', 'prawn', 'prawns', 'crab', 'lobster', 'crawfish', 'crayfish', 'clam', 'clams', 'mussel', 'mussels', 'oyster', 'oysters', 'scallop', 'scallops'] },
  { allergen: 'tree_nuts', words: ['tree nut', 'tree nuts', 'nut', 'nuts', 'almond', 'almonds', 'walnut', 'walnuts', 'cashew', 'cashews', 'pecan', 'pecans', 'pistachio', 'pistachios', 'hazelnut', 'hazelnuts', 'macadamia', 'brazil nut', 'pine nut'] },
  { allergen: 'peanuts', words: ['peanut', 'peanuts', 'nut', 'nuts', 'groundnut', 'groundnuts'] },
  { allergen: 'wheat', words: ['wheat', 'flour'] },
  { gluten: true, words: ['gluten', 'barley', 'rye', 'celiac', 'coeliac'] },
  { allergen: 'soy', words: ['soy', 'soya', 'soybean', 'soybeans', 'tofu', 'edamame'] },
  { allergen: 'sesame', words: ['sesame', 'tahini'] },
];

export interface TypedTerm {
  word: string;
  allergens: Allergen[];
  gluten: boolean;
}

/** Normalise a typed allergy or avoid-word. Returns null for empty or unusably long input. */
export function typedTerm(raw: string): TypedTerm | null {
  const word = raw.toLowerCase().replace(/[^a-z0-9 \-']/g, ' ').replace(/\s+/g, ' ').trim();
  if (word.length < 2 || word.length > 40) return null;
  const allergens = new Set<Allergen>();
  let gluten = false;
  for (const s of SYNONYMS) {
    if (!s.words.includes(word)) continue;
    if (s.allergen) allergens.add(s.allergen);
    if (s.gluten) gluten = true;
  }
  return { word, allergens: [...allergens], gluten };
}

/** Does this word appear in the food's name or its ingredient names? */
export function foodMentions(food: GuideFood, word: string): boolean {
  const w = word.toLowerCase().trim();
  if (w.length < 2) return false;
  const hay = [food.name.toLowerCase(), ...food.ingredients];
  const singular = w.endsWith('s') && w.length > 3 ? w.slice(0, -1) : w;
  return hay.some((h) => h.includes(w) || h.includes(singular));
}

const A = (a: Allergen) => ALLERGEN_LABEL[a].split(' (')[0]!.toLowerCase();

/** Every allergen the person avoids, from the ticked list and from what they typed. */
export function avoidedAllergens(np: Pick<NutritionProfile, 'allergens' | 'otherAllergens'>): Allergen[] {
  const out = new Set<Allergen>(np.allergens);
  for (const raw of np.otherAllergens) for (const a of typedTerm(raw)?.allergens ?? []) out.add(a);
  return [...out];
}

/** Every reason this food must NOT be suggested to this person. Empty means it may be considered. */
export function exclusions(food: GuideFood, np: NutritionProfile, ageYears: number): Exclusion[] {
  const out: Exclusion[] = [];
  const mine = avoidedAllergens(np);
  const typed = np.otherAllergens.map(typedTerm).filter((t): t is TypedTerm => t !== null);

  for (const a of mine) {
    if (food.allergens.includes(a)) out.push({ code: 'allergen', text: `Contains ${A(a)}, which you avoid.`, sourceIds: ['fda-allergens'] });
    else if (food.mayContain.includes(a)) {
      out.push({ code: 'may_contain', text: `Shop-bought versions often contain or are cross-contaminated with ${A(a)}, which you avoid.`, sourceIds: ['fda-allergens'] });
    }
  }
  const glutenAvoid = np.diets.includes('gluten_free') || typed.some((t) => t.gluten);
  if (typed.some((t) => t.gluten) && food.gluten) out.push({ code: 'typed', text: 'Contains gluten, which you said you avoid.', sourceIds: ['fda-allergens'] });
  for (const t of typed) {
    if (t.allergens.length === 0 && !t.gluten && foodMentions(food, t.word)) {
      out.push({ code: 'typed', text: `Mentions “${t.word}”, which you said you avoid.`, sourceIds: ['fda-allergens'] });
    }
  }

  const has = (d: Diet) => np.diets.includes(d);
  const dietHit = (d: Diet, why: string) => out.push({ code: 'diet', text: `${DIET_LABEL[d].split(' (')[0]}: ${why}`, sourceIds: [] });
  if (has('vegan') && (food.meat || food.seafood || food.dairy || food.egg || food.honey)) dietHit('vegan', 'contains an animal product.');
  else if (has('vegetarian') && (food.meat || food.seafood)) dietHit('vegetarian', 'contains meat or fish.');
  if (has('pescatarian') && food.meat) dietHit('pescatarian', 'contains meat.');
  if (has('dairy_free') && (food.dairy || food.allergens.includes('milk'))) dietHit('dairy_free', 'contains dairy.');
  if (glutenAvoid && has('gluten_free') && (food.gluten || food.oats)) {
    dietHit('gluten_free', food.gluten ? 'contains gluten.' : 'oats are often cross-contaminated with gluten.');
  }

  for (const w of np.dislikes) {
    if (foodMentions(food, w)) {
      out.push({ code: 'dislike', text: `You said you dislike ${w}.`, sourceIds: [] });
      break;
    }
  }
  if (ageYears < 5 && food.choking) {
    out.push({ code: 'age', text: 'A choking hazard for children under 5 in this form.', sourceIds: [] });
  }
  return out;
}

/** Likes that match a food. */
export function likedWords(food: GuideFood, np: NutritionProfile): string[] {
  return np.likes.filter((w) => foodMentions(food, w));
}
