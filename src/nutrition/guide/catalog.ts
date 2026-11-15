import type { Allergen, FoodGroup, Slot } from './types';

/**
 * The food guide's catalogue: everyday whole foods and simple meals.
 *
 * - Numbers are ROUGH, rounded values for one typical serving, for planning only. Real products differ;
 *   exact values come from the package label or USDA FoodData Central (see the 'usda-fdc' source).
 * - Meals are BUILT from ingredients, so a meal's calories, groups and allergens can never disagree with
 *   its parts. A unit test checks this.
 * - Allergen data is deliberately conservative and is for the GENERIC food only. `allergens` lists what a
 *   plain version contains; `mayContain` lists what commercial versions often share a factory or recipe
 *   with. A food is never described as "allergy-safe": real products must be checked on the label.
 */

export type Fiber = 'low' | 'mid' | 'high';

export interface GuideFood {
  id: string;
  name: string;
  serving: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  groups: FoodGroup[];
  wholeGrain: boolean;
  /** Allergens a plain version contains. */
  allergens: Allergen[];
  /** Allergens that often appear through ingredients or cross-contact in shop-bought versions. */
  mayContain: Allergen[];
  meat: boolean;
  /** Fish or shellfish. */
  seafood: boolean;
  dairy: boolean;
  egg: boolean;
  honey: boolean;
  /** Contains wheat, barley or rye. */
  gluten: boolean;
  /** Oats: naturally gluten-free but very often cross-contaminated, so not treated as gluten-free. */
  oats: boolean;
  /** A choking hazard for children under 5. */
  choking: boolean;
  fiber: Fiber;
  /** A good source of water (many fruits and vegetables, milk). */
  waterRich: boolean;
  isDrink: boolean;
  /** Where it fits as a food on its own. Empty for pure ingredients. */
  slots: Slot[];
  /** Plain-language ingredient names, used to match words people type (for example "kiwi"). */
  ingredients: string[];
}

interface IngredientDef {
  id: string;
  name: string;
  serving: string;
  n: [kcal: number, protein: number, carbs: number, fat: number];
  groups?: FoodGroup[];
  allergens?: Allergen[];
  may?: Allergen[];
  /** Short flags: meat, seafood, dairy, egg, honey, gluten, oats, choking, whole, water, drink. */
  f?: string[];
  fiber?: Fiber;
  slots?: Slot[];
}

const ING: IngredientDef[] = [
  // Fruit
  { id: 'apple', name: 'Apple', serving: '1 medium', n: [95, 0.5, 25, 0.3], groups: ['fruit'], f: ['water'], fiber: 'mid', slots: ['snack', 'breakfast'] },
  { id: 'banana', name: 'Banana', serving: '1 medium', n: [105, 1.3, 27, 0.4], groups: ['fruit'], fiber: 'low', slots: ['snack', 'breakfast'] },
  { id: 'orange', name: 'Orange', serving: '1 medium', n: [62, 1.2, 15, 0.2], groups: ['fruit'], f: ['water'], fiber: 'mid', slots: ['snack', 'breakfast'] },
  { id: 'strawberries', name: 'Strawberries', serving: '1 cup', n: [49, 1, 12, 0.5], groups: ['fruit'], f: ['water'], fiber: 'mid', slots: ['snack', 'breakfast'] },
  { id: 'blueberries', name: 'Blueberries', serving: '1 cup', n: [84, 1.1, 21, 0.5], groups: ['fruit'], fiber: 'mid', slots: ['snack', 'breakfast'] },
  { id: 'grapes', name: 'Grapes', serving: '1 cup', n: [104, 1.1, 27, 0.2], groups: ['fruit'], f: ['water', 'choking'], fiber: 'low', slots: ['snack'] },
  { id: 'kiwi', name: 'Kiwi', serving: '1 medium', n: [42, 0.8, 10, 0.4], groups: ['fruit'], f: ['water'], fiber: 'mid', slots: ['snack', 'breakfast'] },
  { id: 'watermelon', name: 'Watermelon', serving: '1 cup diced', n: [46, 0.9, 11.5, 0.2], groups: ['fruit'], f: ['water'], fiber: 'low', slots: ['snack'] },
  { id: 'applesauce', name: 'Unsweetened applesauce', serving: '½ cup', n: [51, 0.2, 14, 0.1], groups: ['fruit'], fiber: 'low', slots: ['snack'] },
  { id: 'raisins', name: 'Raisins', serving: '1 small box (about 40 g)', n: [130, 1, 34, 0.2], groups: ['fruit'], f: ['choking'], fiber: 'low', slots: ['snack'] },
  // Vegetables
  { id: 'carrot', name: 'Carrot', serving: '1 medium', n: [25, 0.6, 6, 0.1], groups: ['vegetable'], f: ['choking'], fiber: 'mid', slots: ['snack'] },
  { id: 'cucumber', name: 'Cucumber', serving: '1 cup sliced', n: [16, 0.7, 3.8, 0.1], groups: ['vegetable'], f: ['water'], fiber: 'low', slots: ['snack'] },
  { id: 'tomato', name: 'Tomato', serving: '1 medium', n: [22, 1.1, 4.8, 0.2], groups: ['vegetable'], f: ['water'], fiber: 'low' },
  { id: 'bell_pepper', name: 'Bell pepper', serving: '1 medium', n: [31, 1, 7, 0.3], groups: ['vegetable'], f: ['water'], fiber: 'mid', slots: ['snack'] },
  { id: 'broccoli', name: 'Broccoli', serving: '1 cup', n: [31, 2.6, 6, 0.3], groups: ['vegetable'], fiber: 'mid' },
  { id: 'salad_greens', name: 'Salad greens', serving: '2 cups', n: [20, 1.5, 3.5, 0.2], groups: ['vegetable'], f: ['water'], fiber: 'low' },
  { id: 'sweet_potato', name: 'Sweet potato (baked)', serving: '1 medium', n: [112, 2, 26, 0.1], groups: ['vegetable'], fiber: 'mid', slots: ['dinner', 'lunch'] },
  { id: 'avocado', name: 'Avocado', serving: '½ avocado', n: [160, 2, 9, 15], groups: [], fiber: 'mid' },
  // Grains
  { id: 'oatmeal', name: 'Oatmeal (cooked in water)', serving: '1 cup', n: [160, 6, 27, 3], groups: ['grain'], f: ['oats', 'whole'], fiber: 'mid', slots: ['breakfast'] },
  { id: 'bread', name: 'Whole-wheat bread', serving: '1 slice', n: [80, 3, 15, 1], groups: ['grain'], allergens: ['wheat'], may: ['soy', 'sesame', 'milk', 'egg'], f: ['gluten', 'whole'], fiber: 'mid' },
  { id: 'brown_rice', name: 'Brown rice (cooked)', serving: '1 cup', n: [215, 5, 45, 1.8], groups: ['grain'], f: ['whole'], fiber: 'mid' },
  { id: 'quinoa', name: 'Quinoa (cooked)', serving: '1 cup', n: [222, 8, 39, 3.6], groups: ['grain'], f: ['whole'], fiber: 'mid' },
  { id: 'pasta', name: 'Whole-wheat pasta (cooked)', serving: '1 cup', n: [174, 7.5, 37, 0.8], groups: ['grain'], allergens: ['wheat'], may: ['egg'], f: ['gluten', 'whole'], fiber: 'mid' },
  { id: 'corn_tortilla', name: 'Corn tortilla', serving: '2 small tortillas', n: [104, 2.8, 22, 1.4], groups: ['grain'], f: ['whole'], fiber: 'mid' },
  { id: 'popcorn', name: 'Plain popcorn', serving: '3 cups popped', n: [93, 3, 19, 1], groups: ['grain'], f: ['whole', 'choking'], fiber: 'mid', slots: ['snack'] },
  { id: 'rice_cakes', name: 'Plain rice cakes', serving: '2 cakes', n: [70, 1.5, 15, 0.5], groups: ['grain'], fiber: 'low', slots: ['snack'] },
  // Protein foods
  { id: 'egg', name: 'Egg', serving: '1 large', n: [72, 6.3, 0.4, 4.8], groups: ['protein'], allergens: ['egg'], f: ['egg'], fiber: 'low' },
  { id: 'chicken', name: 'Chicken breast (cooked)', serving: 'about 120 g', n: [200, 37, 0, 4.3], groups: ['protein'], f: ['meat'], fiber: 'low' },
  { id: 'tuna', name: 'Canned tuna in water', serving: '3 oz', n: [100, 22, 0, 1], groups: ['protein'], allergens: ['fish'], f: ['seafood'], fiber: 'low' },
  { id: 'salmon', name: 'Salmon (baked)', serving: '1 fillet, about 180 g', n: [370, 40, 0, 22], groups: ['protein'], allergens: ['fish'], f: ['seafood'], fiber: 'low' },
  { id: 'shrimp', name: 'Shrimp (cooked)', serving: '3 oz', n: [84, 20, 0, 0.2], groups: ['protein'], allergens: ['shellfish'], f: ['seafood'], fiber: 'low' },
  { id: 'lentils', name: 'Lentils (cooked)', serving: '1 cup', n: [230, 18, 40, 0.8], groups: ['protein'], fiber: 'high' },
  { id: 'black_beans', name: 'Black beans (cooked)', serving: '1 cup', n: [227, 15, 41, 0.9], groups: ['protein'], fiber: 'high' },
  { id: 'chickpeas', name: 'Chickpeas (cooked)', serving: '1 cup', n: [269, 14.5, 45, 4.2], groups: ['protein'], fiber: 'high' },
  { id: 'tofu', name: 'Firm tofu', serving: '½ cup', n: [180, 20, 3, 11], groups: ['protein'], allergens: ['soy'], fiber: 'low' },
  { id: 'edamame', name: 'Edamame (shelled)', serving: '½ cup', n: [95, 9, 8, 4], groups: ['protein'], allergens: ['soy'], fiber: 'mid', slots: ['snack'] },
  { id: 'peanut_butter', name: 'Peanut butter', serving: '2 tablespoons', n: [190, 7, 7, 16], groups: ['protein'], allergens: ['peanuts'], may: ['tree_nuts'], f: ['choking'], fiber: 'low' },
  { id: 'almonds', name: 'Almonds', serving: 'a handful (28 g)', n: [164, 6, 6, 14], groups: ['protein'], allergens: ['tree_nuts'], may: ['peanuts'], f: ['choking'], fiber: 'mid', slots: ['snack'] },
  { id: 'walnuts', name: 'Walnuts', serving: 'a handful (28 g)', n: [185, 4, 4, 18.5], groups: ['protein'], allergens: ['tree_nuts'], may: ['peanuts'], f: ['choking'], fiber: 'mid' },
  { id: 'pumpkin_seeds', name: 'Pumpkin seeds', serving: 'a handful (28 g)', n: [158, 8.5, 3, 14], groups: ['protein'], may: ['tree_nuts', 'peanuts', 'sesame'], f: ['choking'], fiber: 'mid', slots: ['snack'] },
  { id: 'hummus', name: 'Hummus', serving: '¼ cup (about 60 g)', n: [100, 4.5, 8, 6], groups: ['protein'], allergens: ['sesame'], fiber: 'mid', slots: ['snack'] },
  // Dairy and alternatives
  { id: 'milk', name: 'Milk', serving: '1 cup', n: [122, 8, 12, 4.8], groups: ['dairy'], allergens: ['milk'], f: ['dairy', 'water', 'drink'], fiber: 'low', slots: ['snack', 'breakfast'] },
  { id: 'chocolate_milk', name: 'Chocolate milk', serving: '1 cup', n: [200, 8, 30, 5], groups: ['dairy'], allergens: ['milk'], may: ['soy'], f: ['dairy', 'water', 'drink'], fiber: 'low', slots: ['snack'] },
  { id: 'yogurt', name: 'Plain yogurt', serving: '1 cup', n: [154, 13, 17, 3.8], groups: ['dairy'], allergens: ['milk'], f: ['dairy', 'water'], fiber: 'low', slots: ['snack', 'breakfast'] },
  { id: 'greek_yogurt', name: 'Plain Greek yogurt (nonfat)', serving: '¾ cup', n: [100, 17, 6, 0.7], groups: ['dairy'], allergens: ['milk'], f: ['dairy', 'water'], fiber: 'low', slots: ['snack', 'breakfast'] },
  { id: 'cottage_cheese', name: 'Cottage cheese (low-fat)', serving: '½ cup', n: [82, 14, 3, 1.2], groups: ['dairy'], allergens: ['milk'], f: ['dairy'], fiber: 'low', slots: ['snack'] },
  { id: 'cheddar', name: 'Cheddar cheese', serving: '1 oz slice', n: [113, 7, 0.4, 9.3], groups: ['dairy'], allergens: ['milk'], f: ['dairy'], fiber: 'low', slots: ['snack'] },
  { id: 'soy_milk', name: 'Fortified soy milk (unsweetened)', serving: '1 cup', n: [80, 7, 4, 4], groups: ['dairy'], allergens: ['soy'], f: ['water', 'drink'], fiber: 'low', slots: ['snack', 'breakfast'] },
  // Other
  { id: 'olive_oil', name: 'Olive oil', serving: '1 tablespoon', n: [119, 0, 0, 13.5], groups: [], fiber: 'low' },
  { id: 'honey', name: 'Honey', serving: '1 tablespoon', n: [64, 0.1, 17, 0], groups: [], f: ['honey'], fiber: 'low' },
  { id: 'water', name: 'Water', serving: '1 cup', n: [0, 0, 0, 0], groups: [], f: ['water', 'drink'], fiber: 'low', slots: ['snack'] },
];

const flag = (d: IngredientDef, k: string) => !!d.f?.includes(k);

const FIBER_RANK: Record<Fiber, number> = { low: 0, mid: 1, high: 2 };
const FIBER_BY_RANK: Fiber[] = ['low', 'mid', 'high'];
const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const round1 = (n: number) => Math.round(n * 10) / 10;

function fromIngredient(d: IngredientDef): GuideFood {
  return {
    id: d.id,
    name: d.name,
    serving: d.serving,
    kcal: d.n[0],
    protein: d.n[1],
    carbs: d.n[2],
    fat: d.n[3],
    groups: d.groups ?? [],
    wholeGrain: flag(d, 'whole'),
    allergens: d.allergens ?? [],
    mayContain: d.may ?? [],
    meat: flag(d, 'meat'),
    seafood: flag(d, 'seafood'),
    dairy: flag(d, 'dairy'),
    egg: flag(d, 'egg'),
    honey: flag(d, 'honey'),
    gluten: flag(d, 'gluten'),
    oats: flag(d, 'oats'),
    choking: flag(d, 'choking'),
    fiber: d.fiber ?? 'low',
    waterRich: flag(d, 'water'),
    isDrink: flag(d, 'drink'),
    slots: d.slots ?? [],
    ingredients: [d.name.toLowerCase(), d.id.replace(/_/g, ' ')],
  };
}

const BASE = new Map(ING.map((d) => [d.id, fromIngredient(d)]));

/** An ingredient by id (also the building blocks of meals). */
export function ingredient(id: string): GuideFood {
  const f = BASE.get(id);
  if (!f) throw new Error(`Unknown ingredient: ${id}`);
  return f;
}

interface MealDef {
  id: string;
  name: string;
  serving: string;
  slots: Slot[];
  parts: [ingredientId: string, servings: number][];
}

/** Build a meal from its parts: totals, groups, allergens and diet flags are all derived, never typed. */
function compose(m: MealDef): GuideFood {
  const parts = m.parts.map(([id, s]) => ({ f: ingredient(id), s }));
  const sum = (pick: (f: GuideFood) => number) => round1(parts.reduce((a, p) => a + pick(p.f) * p.s, 0));
  const anyOf = (pick: (f: GuideFood) => boolean) => parts.some((p) => pick(p.f));
  const allergens = uniq(parts.flatMap((p) => p.f.allergens));
  return {
    id: m.id,
    name: m.name,
    serving: m.serving,
    kcal: Math.round(sum((f) => f.kcal)),
    protein: sum((f) => f.protein),
    carbs: sum((f) => f.carbs),
    fat: sum((f) => f.fat),
    groups: uniq(parts.flatMap((p) => p.f.groups)),
    wholeGrain: anyOf((f) => f.wholeGrain),
    allergens,
    mayContain: uniq(parts.flatMap((p) => p.f.mayContain)).filter((a) => !allergens.includes(a)),
    meat: anyOf((f) => f.meat),
    seafood: anyOf((f) => f.seafood),
    dairy: anyOf((f) => f.dairy),
    egg: anyOf((f) => f.egg),
    honey: anyOf((f) => f.honey),
    gluten: anyOf((f) => f.gluten),
    oats: anyOf((f) => f.oats),
    choking: anyOf((f) => f.choking),
    fiber: FIBER_BY_RANK[Math.max(...parts.map((p) => FIBER_RANK[p.f.fiber]))]!,
    waterRich: anyOf((f) => f.waterRich),
    isDrink: false,
    slots: m.slots,
    ingredients: uniq(parts.flatMap((p) => p.f.ingredients)),
  };
}

const MEALS: MealDef[] = [
  // Breakfasts
  { id: 'oats_milk_banana', name: 'Oatmeal with milk and banana', serving: '1 bowl', slots: ['breakfast'], parts: [['oatmeal', 1], ['milk', 0.5], ['banana', 1]] },
  { id: 'oats_berries_walnuts', name: 'Oatmeal with blueberries and walnuts', serving: '1 bowl', slots: ['breakfast'], parts: [['oatmeal', 1], ['blueberries', 0.5], ['walnuts', 0.5]] },
  { id: 'oats_soy_strawberries', name: 'Oatmeal with soy milk and strawberries', serving: '1 bowl', slots: ['breakfast'], parts: [['oatmeal', 1], ['soy_milk', 0.5], ['strawberries', 0.5]] },
  { id: 'eggs_toast', name: 'Scrambled eggs on whole-wheat toast', serving: '2 eggs and 1 slice', slots: ['breakfast'], parts: [['egg', 2], ['bread', 1], ['olive_oil', 0.25]] },
  { id: 'greek_yogurt_berries', name: 'Greek yogurt with blueberries', serving: '1 bowl', slots: ['breakfast', 'snack'], parts: [['greek_yogurt', 1], ['blueberries', 0.5]] },
  { id: 'pb_banana_toast', name: 'Peanut butter and banana toast', serving: '1 slice', slots: ['breakfast', 'snack'], parts: [['peanut_butter', 1], ['bread', 1], ['banana', 0.5]] },
  { id: 'tofu_scramble', name: 'Tofu scramble with peppers', serving: '1 plate', slots: ['breakfast', 'lunch'], parts: [['tofu', 1], ['bell_pepper', 0.5], ['olive_oil', 0.5]] },
  { id: 'veg_omelette', name: 'Veggie omelette', serving: '3 eggs', slots: ['breakfast', 'lunch', 'dinner'], parts: [['egg', 3], ['bell_pepper', 0.5], ['tomato', 0.5], ['olive_oil', 0.5]] },
  // Lunches and dinners
  { id: 'chicken_rice_broccoli', name: 'Chicken, brown rice and broccoli', serving: '1 plate', slots: ['lunch', 'dinner'], parts: [['chicken', 1], ['brown_rice', 1], ['broccoli', 1], ['olive_oil', 0.5]] },
  { id: 'salmon_sweet_potato', name: 'Salmon, sweet potato and greens', serving: '1 plate', slots: ['dinner'], parts: [['salmon', 1], ['sweet_potato', 1], ['salad_greens', 1], ['olive_oil', 0.5]] },
  { id: 'lentil_quinoa_bowl', name: 'Lentil and quinoa bowl with vegetables', serving: '1 bowl', slots: ['lunch', 'dinner'], parts: [['lentils', 1], ['quinoa', 0.5], ['carrot', 1], ['tomato', 1], ['olive_oil', 0.5]] },
  { id: 'bean_rice_bowl', name: 'Black bean and rice bowl with avocado', serving: '1 bowl', slots: ['lunch', 'dinner'], parts: [['black_beans', 1], ['brown_rice', 1], ['bell_pepper', 0.5], ['avocado', 0.5]] },
  { id: 'chickpea_salad', name: 'Chickpea and cucumber salad', serving: '1 bowl', slots: ['lunch'], parts: [['chickpeas', 1], ['cucumber', 1], ['tomato', 1], ['salad_greens', 1], ['olive_oil', 1]] },
  { id: 'tuna_sandwich', name: 'Tuna and greens sandwich', serving: '1 sandwich', slots: ['lunch'], parts: [['tuna', 1], ['bread', 2], ['salad_greens', 0.5], ['tomato', 0.5]] },
  { id: 'chicken_sandwich', name: 'Chicken and tomato sandwich', serving: '1 sandwich', slots: ['lunch'], parts: [['chicken', 0.75], ['bread', 2], ['tomato', 0.5], ['salad_greens', 0.5]] },
  { id: 'tofu_stir_fry', name: 'Tofu and vegetable stir-fry with brown rice', serving: '1 plate', slots: ['lunch', 'dinner'], parts: [['tofu', 1], ['brown_rice', 1], ['broccoli', 1], ['bell_pepper', 1], ['olive_oil', 0.5]] },
  { id: 'shrimp_pasta', name: 'Shrimp and tomato pasta with broccoli', serving: '1 plate', slots: ['dinner'], parts: [['shrimp', 1.5], ['pasta', 1], ['tomato', 1], ['broccoli', 0.5], ['olive_oil', 0.5]] },
  { id: 'bean_quesadilla', name: 'Bean and cheese quesadilla', serving: '1 quesadilla', slots: ['lunch', 'dinner'], parts: [['black_beans', 0.5], ['corn_tortilla', 1], ['cheddar', 1]] },
  { id: 'hummus_veg_plate', name: 'Hummus with carrots, cucumber and pepper', serving: '1 plate', slots: ['snack', 'lunch'], parts: [['hummus', 1], ['carrot', 1], ['cucumber', 1], ['bell_pepper', 0.5]] },
  { id: 'chicken_pasta_veg', name: 'Chicken pasta with vegetables', serving: '1 plate', slots: ['dinner'], parts: [['chicken', 0.75], ['pasta', 1], ['broccoli', 1], ['tomato', 1], ['olive_oil', 0.5]] },
  // Snacks
  { id: 'apple_pb', name: 'Apple with peanut butter', serving: '1 apple, 1 tablespoon', slots: ['snack'], parts: [['apple', 1], ['peanut_butter', 0.5]] },
  { id: 'apple_cheddar', name: 'Apple with cheddar', serving: '1 apple, 1 slice', slots: ['snack'], parts: [['apple', 1], ['cheddar', 1]] },
  { id: 'yogurt_strawberries', name: 'Yogurt with strawberries', serving: '1 bowl', slots: ['snack', 'breakfast'], parts: [['yogurt', 1], ['strawberries', 0.5]] },
  { id: 'cottage_orange', name: 'Cottage cheese with an orange', serving: '1 bowl and 1 orange', slots: ['snack'], parts: [['cottage_cheese', 1], ['orange', 1]] },
  { id: 'almonds_raisins', name: 'Almonds and raisins', serving: 'a small handful of each', slots: ['snack'], parts: [['almonds', 0.75], ['raisins', 0.5]] },
  { id: 'egg_orange', name: 'Hard-boiled egg and an orange', serving: '1 egg, 1 orange', slots: ['snack'], parts: [['egg', 1], ['orange', 1]] },
  { id: 'ricecake_pb_banana', name: 'Rice cakes with peanut butter and banana', serving: '2 cakes', slots: ['snack'], parts: [['rice_cakes', 1], ['peanut_butter', 0.5], ['banana', 0.5]] },
  { id: 'berry_yogurt_smoothie', name: 'Banana-berry yogurt smoothie', serving: '1 large glass', slots: ['snack', 'breakfast'], parts: [['banana', 1], ['blueberries', 0.5], ['yogurt', 1], ['milk', 0.5]] },
  { id: 'soy_banana_smoothie', name: 'Soy milk banana and strawberry smoothie', serving: '1 large glass', slots: ['snack', 'breakfast'], parts: [['soy_milk', 1], ['banana', 1], ['strawberries', 0.5]] },
  { id: 'bean_corn_tortilla_snack', name: 'Black beans on corn tortilla with tomato', serving: '2 small tortillas', slots: ['snack', 'lunch'], parts: [['black_beans', 0.5], ['corn_tortilla', 1], ['tomato', 0.5]] },
  { id: 'banana_pb_ricecake', name: 'Banana with honey on rice cakes', serving: '2 cakes', slots: ['snack'], parts: [['rice_cakes', 1], ['banana', 1], ['honey', 0.5]] },
];

const INGREDIENT_FOODS: GuideFood[] = ING.filter((d) => (d.slots?.length ?? 0) > 0).map((d) => ingredient(d.id));

/** Every food the guide can suggest, in a fixed order (so results are the same every time). */
export const GUIDE_FOODS: readonly GuideFood[] = [...INGREDIENT_FOODS, ...MEALS.map(compose)];
export const INGREDIENTS: readonly GuideFood[] = [...BASE.values()];

const byId = new Map(GUIDE_FOODS.map((f) => [f.id, f]));
export const guideFoodById = (id: string): GuideFood | undefined => byId.get(id);

/** Meals are built from these parts (exposed so tests can verify the derivation). */
export const MEAL_DEFS: readonly MealDef[] = MEALS;
