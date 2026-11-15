import { guideFoodById } from './catalog';
import type { Allergen, FoodGroup } from './types';

/**
 * Reading what you already logged. Foods logged from the guide have exact groups and allergens. Foods
 * logged from a photo or the big food list (pizza, ramen…) are matched by name with simple keyword rules.
 * Those rules are APPROXIMATE on purpose: they only feed the "food groups this week" picture, and the
 * allergen hints only ever add a warning. They never say a dish is safe.
 */

const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
/** Word-start match, so "pea" cannot match "peach". */
const any = (text: string, list: string[]) => list.some((w) => text.includes(` ${w}`));

/** Treats and fried snacks do not count towards a food group. */
const TREATS = ['pie', 'cake', 'cakes', 'cookie', 'cookies', 'brownie', 'donut', 'donuts', 'doughnut', 'ice cream', 'cannoli', 'churros', 'baklava', 'mousse', 'pudding', 'tiramisu', 'macarons', 'brulee', 'panna cotta', 'cheesecake', 'beignets', 'candy', 'chocolate', 'frozen yogurt', 'cupcake', 'shortcake', 'fries', 'onion rings', 'chips', 'poutine', 'pastry'];

const FRUIT = ['apple', 'banana', 'orange', 'strawberr', 'grape', 'pineapple', 'pomegranate', 'fig', 'berr', 'melon', 'mango', 'peach', 'pear', 'kiwi', 'cherr', 'lemon', 'papaya', 'plum', 'raisin', 'date', 'lychee', 'dragon fruit', 'passion fruit', 'guava', 'persimmon', 'apricot', 'nectarine', 'cantaloupe', 'honeydew', 'tangerine', 'lime', 'cranberr', 'prune', 'jackfruit', 'pomelo', 'clementine', 'star fruit', 'coconut', 'grapefruit', 'dried fruit', 'dried mango', 'dried apricot'];
const VEG = ['salad', 'broccoli', 'carrot', 'cauliflower', 'cabbage', 'pepper', 'cucumber', 'tomato', 'zucchini', 'squash', 'mushroom', 'artichoke', 'beet', 'seaweed', 'kale', 'spinach', 'lettuce', 'corn', 'onion soup', 'potato', 'greens', 'vegetable', 'veggie', 'peas', 'radish', 'leek', 'turnip', 'parsnip', 'pumpkin', 'bok choy', 'collard', 'chard', 'arugula', 'okra', 'sprouts', 'fennel', 'jalapeno', 'portobello', 'shiitake', 'pickles', 'sauerkraut', 'kimchi', 'kale', 'beetroot', 'celery', 'onion', 'brussels', 'ratatouille', 'gado', 'som tam', 'okra'];
const GRAIN = ['bread', 'bagel', 'baguette', 'pasta', 'spaghetti', 'noodle', 'rice', 'ramen', 'pizza', 'pancake', 'waffle', 'french toast', 'oatmeal', 'granola', 'cereal', 'tortilla', 'taco', 'burrito', 'sandwich', 'burger', 'hamburger', 'hot dog', 'sushi', 'dumpling', 'gyoza', 'ravioli', 'lasagna', 'macaroni', 'gnocchi', 'risotto', 'pretzel', 'cracker', 'popcorn', 'samosa', 'spring roll', 'quesadilla', 'nachos', 'bibimbap', 'pad thai', 'pho', 'paella', 'couscous', 'dosa', 'naan', 'roti', 'biryani', 'bruschetta', 'garlic bread', 'grits', 'roll', 'muffin', 'scone', 'biscuit', 'crumpet', 'brioche', 'breadsticks', 'sourdough', 'ciabatta', 'rye', 'calzone', 'penne', 'fettuccine', 'polenta', 'barley', 'bulgur', 'cornflakes', 'pilaf', 'pastry', 'danish', 'blini', 'spaetzle', 'manakish', 'koshari', 'upma', 'poha', 'quinoa', 'focaccia', 'arancini', 'wrap', 'sandwich', 'bowl', 'toast', 'cannelloni', 'mee goreng', 'kway teow', 'lo mein', 'chow', 'jambalaya', 'tostada', 'taquitos', 'paratha', 'bhaji', 'bhature', 'dosa'];
const PROTEIN = ['chicken', 'beef', 'steak', 'pork', 'ribs', 'wings', 'fish', 'salmon', 'tuna', 'shrimp', 'prawn', 'crab', 'lobster', 'oyster', 'mussel', 'scallop', 'calamari', 'sashimi', 'tartare', 'carpaccio', 'egg', 'omelette', 'benedict', 'tofu', 'bean', 'lentil', 'chickpea', 'hummus', 'falafel', 'edamame', 'nut', 'almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'peanut', 'hazelnut', 'macadamia', 'seeds', 'duck', 'turkey', 'ham', 'bacon', 'sausage', 'hot dog', 'burger', 'hamburger', 'meat', 'curry', 'ceviche', 'escargots', 'foie gras', 'prime rib', 'filet', 'kidney', 'pinto', 'lima', 'white beans', 'tuna', 'cod', 'tilapia', 'sardine', 'mackerel', 'trout', 'clam', 'octopus', 'anchov', 'roast beef', 'thigh', 'drumstick', 'lamb', 'veal', 'pastrami', 'salami', 'pepperoni', 'prosciutto', 'jerky', 'nigiri', 'unagi', 'char siu', 'korma', 'vindaloo', 'rendang', 'adobo', 'jerk', 'souvlaki', 'meatball', 'nugget', 'fish sticks', 'stew', 'cassoulet', 'coq au vin', 'osso buco', 'saltimbocca', 'ropa vieja', 'birria', 'mole', 'dakgalbi', 'bulgogi', 'korean bbq', 'samgyeopsal', 'oyakodon', 'gyudon', 'tamagoyaki', 'karaage', 'pork', 'beef', 'lentils', 'chickpeas'];
const DAIRY = ['milk', 'cheese', 'yogurt', 'yoghurt', 'mozzarella', 'paneer', 'cheddar', 'parmesan', 'feta', 'brie', 'kefir', 'labneh', 'lassi'];

export function groupsForFoodId(foodId: string | undefined, name = ''): FoodGroup[] {
  if (!foodId) return [];
  if (foodId.startsWith('guide:')) return guideFoodById(foodId.slice(6))?.groups ?? [];
  const text = words(`${foodId.replace(/_/g, ' ')} ${name}`);
  if (any(text, TREATS)) return [];
  const out: FoodGroup[] = [];
  if (any(text, FRUIT)) out.push('fruit');
  if (any(text, VEG)) out.push('vegetable');
  if (any(text, GRAIN)) out.push('grain');
  if (any(text, PROTEIN)) out.push('protein');
  if (any(text, DAIRY)) out.push('dairy');
  return out;
}

const HINTS: Record<Allergen, string[]> = {
  milk: ['milk', 'cheese', 'cheesy', 'yogurt', 'yoghurt', 'butter', 'cream', 'creamy', 'custard', 'ice cream', 'latte', 'mozzarella', 'paneer', 'parmesan', 'alfredo', 'carbonara', 'bisque', 'chowder', 'lasagna', 'pizza', 'quesadilla', 'nachos', 'macaroni', 'cannoli', 'tiramisu', 'panna', 'mousse', 'brulee', 'cheesecake', 'pudding', 'poutine', 'croque', 'benedict', 'mashed', 'masala', 'korma', 'waffle', 'pancake', 'french toast', 'cake', 'cakes', 'cheesecake', 'shortcake', 'cupcake', 'pie', 'cookie', 'brownie', 'donut', 'muffin', 'croissant', 'beignet', 'churro', 'caesar', 'risotto', 'gnocchi'],
  egg: ['egg', 'omelette', 'benedict', 'carbonara', 'french toast', 'pancake', 'waffle', 'cake', 'cakes', 'cheesecake', 'shortcake', 'custard', 'brulee', 'tiramisu', 'mousse', 'mayonnaise', 'caesar', 'aioli', 'brownie', 'cookie', 'cupcake', 'donut', 'beignet', 'churro', 'macaron', 'quiche', 'fried rice', 'pad thai', 'ravioli', 'gnocchi', 'lasagna', 'ramen', 'noodle', 'tempura', 'takoyaki', 'croque', 'deviled', 'pie', 'meringue'],
  wheat: ['bread', 'bagel', 'baguette', 'pasta', 'spaghetti', 'noodle', 'ramen', 'pizza', 'pancake', 'waffle', 'cake', 'cakes', 'cheesecake', 'shortcake', 'cupcake', 'pie', 'cookie', 'brownie', 'donut', 'cannoli', 'churro', 'beignet', 'pretzel', 'cracker', 'dumpling', 'gyoza', 'ravioli', 'lasagna', 'gnocchi', 'sandwich', 'burger', 'hamburger', 'hot dog', 'bun', 'taco', 'burrito', 'quesadilla', 'samosa', 'spring roll', 'fried', 'breaded', 'croque', 'bruschetta', 'garlic bread', 'caesar', 'tempura', 'takoyaki', 'fish and chips', 'onion rings', 'baklava', 'tiramisu', 'bread pudding', 'french toast', 'granola', 'cereal'],
  soy: ['soy', 'tofu', 'edamame', 'miso', 'tempeh', 'teriyaki', 'bibimbap', 'fried rice', 'pad thai', 'ramen', 'sushi', 'hot and sour', 'dumpling', 'gyoza', 'spring roll', 'peking'],
  fish: ['fish', 'salmon', 'tuna', 'sashimi', 'sushi', 'ceviche', 'anchovy', 'caesar', 'pad thai', 'paella', 'pho'],
  shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'scallop', 'mussel', 'oyster', 'clam', 'calamari', 'paella', 'pad thai', 'ceviche', 'bisque', 'chowder', 'pho'],
  tree_nuts: ['almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'brazil', 'nuts', 'pesto', 'baklava', 'macaron', 'carrot cake', 'granola', 'trail mix', 'praline'],
  peanuts: ['peanut', 'trail mix', 'pad thai', 'satay', 'granola'],
  sesame: ['sesame', 'tahini', 'hummus', 'falafel', 'bagel', 'burger', 'hamburger', 'bibimbap', 'gyoza', 'dumpling', 'seaweed', 'sushi'],
};

/** Allergens a dish of this name COULD contain. Recipes vary, so this is a warning prompt only, never a safe/unsafe verdict. */
export function allergenHints(name: string, foodId = ''): Allergen[] {
  if (foodId.startsWith('guide:')) {
    const f = guideFoodById(foodId.slice(6));
    return f ? [...new Set([...f.allergens, ...f.mayContain])] : [];
  }
  const text = words(`${foodId.replace(/_/g, ' ')} ${name}`);
  return (Object.keys(HINTS) as Allergen[]).filter((a) => any(text, HINTS[a]));
}
