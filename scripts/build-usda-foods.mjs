#!/usr/bin/env node
/**
 * Developer tool (not part of the app build): turns the USDA FoodData Central "SR Legacy" CSV download into
 *   public/data/usda-foods.json   every food, compact, loaded only when someone searches (about 7,000 foods)
 *   src/nutrition/usda.ts         a few hundred common, photo-friendly foods the image model can also recognise
 *
 *   node scripts/build-usda-foods.mjs <folder that holds food.csv, food_nutrient.csv, food_portion.csv, measure_unit.csv, food_category.csv>
 *
 * Source: USDA FoodData Central, SR Legacy (April 2018), https://fdc.nal.usda.gov/download-datasets/
 * Licence: public domain, CC0 1.0 Universal. The USDA asks users to credit FoodData Central as the source.
 *
 * Values are USDA's per-100 g figures scaled to the first listed household portion, then rounded. They are
 * averages for a food in general, not for a particular product.
 */
import { createReadStream, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2];
if (!dir) throw new Error('Pass the folder with the SR Legacy CSV files.');

function parseLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

async function rows(file, onRow) {
  const rl = createInterface({ input: createReadStream(join(dir, file), 'utf8'), crlfDelay: Infinity });
  let header = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cells = parseLine(line);
    if (!header) {
      header = cells;
      continue;
    }
    const o = {};
    header.forEach((h, i) => (o[h] = cells[i] ?? ''));
    onRow(o);
  }
}

const foods = new Map();
const categories = new Map();
const units = new Map();
const portions = new Map();
const nutrients = new Map();
const NUT = { 1008: 'kcal', 1003: 'protein', 1005: 'carbs', 1004: 'fat' };

await rows('food_category.csv', (r) => categories.set(Number(r.id), r.description));
await rows('measure_unit.csv', (r) => units.set(r.id, r.name));
await rows('food.csv', (r) => foods.set(r.fdc_id, { id: Number(r.fdc_id), name: r.description.trim(), cat: Number(r.food_category_id) }));
await rows('food_portion.csv', (r) => {
  const cur = portions.get(r.fdc_id);
  if (!cur || Number(r.seq_num) < cur.seq) portions.set(r.fdc_id, { seq: Number(r.seq_num), amount: Number(r.amount), unit: units.get(r.measure_unit_id) ?? '', desc: (r.portion_description || r.modifier || '').trim(), grams: Number(r.gram_weight) });
});
await rows('food_nutrient.csv', (r) => {
  const key = NUT[Number(r.nutrient_id)];
  if (!key) return;
  const o = nutrients.get(r.fdc_id) ?? {};
  o[key] = Number(r.amount);
  nutrients.set(r.fdc_id, o);
});

// Categories left out: baby food, branded products, quality-control samples, alcohol.
const SKIP_CATS = new Set([3, 26, 27, 28]);
const r1 = (n) => Math.round(n * 10) / 10;
const all = [];
for (const f of foods.values()) {
  if (SKIP_CATS.has(f.cat)) continue;
  f.name = f.name.replace(/\s*\([^)]*Food Distribution Program[^)]*\)/gi, '').trim();
  // Alcohol is left out: this app is also for children and teens.
  if (/^alcoholic beverage|^liqueur|^wine\b|^beer\b|^distilled|^whiskey|^rum\b|^vodka/i.test(f.name)) continue;
  const n = nutrients.get(String(f.id));
  if (!n || ![n.kcal, n.protein, n.carbs, n.fat].every(Number.isFinite)) continue;
  const p = portions.get(String(f.id));
  const grams = p && p.grams > 0 ? p.grams : 100;
  const unit = p && p.unit && p.unit !== 'undetermined' ? p.unit : '';
  const serving = p && p.grams > 0 ? `${p.amount} ${unit} ${p.desc}`.replace(/\s+/g, ' ').trim() : '100 g';
  const k = grams / 100;
  if (n.kcal * k > 1500) continue; // a whole cake or tray is not a serving
  all.push({ id: f.id, name: f.name, cat: f.cat, grams: Math.round(grams), serving, kcal: Math.round(n.kcal * k), protein: r1(n.protein * k), carbs: r1(n.carbs * k), fat: r1(n.fat * k) });
}
all.sort((a, b) => a.name.localeCompare(b.name));
console.log(`[usda] ${all.length} foods in the database`);

mkdirSync(join(root, 'public', 'data'), { recursive: true });
writeFileSync(
  join(root, 'public', 'data', 'usda-foods.json'),
  JSON.stringify({ source: 'USDA FoodData Central, SR Legacy (April 2018)', licence: 'CC0 1.0 Universal (public domain)', url: 'https://fdc.nal.usda.gov/', fields: ['id', 'name', 'serving', 'grams', 'kcal', 'protein', 'carbs', 'fat'], foods: all.map((f) => [f.id, f.name, f.serving, f.grams, f.kcal, f.protein, f.carbs, f.fat]) }),
);

// ───────── The photo-friendly subset ─────────
const existing = new Set();
const existingNames = new Set();
for (const file of ['src/nutrition/foods.ts', 'src/nutrition/world.ts']) {
  for (const line of readFileSync(join(root, file), 'utf8').split(/\r?\n/)) {
    const m = /^\s*\['([a-z0-9_]+)',\s*'((?:[^'\\]|\\.)+)'/.exec(line);
    if (m) {
      existing.add(m[1]);
      existingNames.add(norm(m[2]));
    }
  }
}
function norm(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .sort()
    .join(' ');
}

const WANT = new Set([1, 5, 6, 9, 10, 11, 12, 13, 15, 16, 18, 20, 22]);
const DENY = new RegExp("unprepared|\\bdry\\b|dehydrated|powder|\\bmix\\b|concentrate|canned|infant|baby|formula|substitute|imitation|nfs|brand|lard|tallow|shortening|\\boil\\b|organ|liver|giblet|kidney|brain|tongue|tripe|heart|spleen|lung|stomach|blood|\\bbone|separable|trimmed|lean only|fat only|usda|salt added|enriched|unenriched|fortified|low sodium|dietetic|reduced|light|fat free|nonfat|lowfat|low fat|no sugar|sugar free|with added|alcoholic|\\bbeer\\b|\\bwine\\b|liquor|sweetener|syrup|\\bgum\\b|seasoning|spice|extract|flavor|starch|flour|\\bbran\\b|germ|isolate|gluten|yeast|baking|leavening|coloring|instant|\\bdried\\b|freeze-dried|sun-dried|variety meats|by-products|meatless|\\bfeet\\b|gizzard|\\bneck\\b|\\bcured\\b|spread|\\bloaf\\b|\\bsticks\\b|\\bbits\\b|entree|frozen|ground,|grass-fed|broilers|capons|roasting|stewing|cornish|pot pie|clarified|whipped|\\bfood\\b|process|sauce|cold pack|kimchi|abiyuch|acerola|acorn|alfalfa|amaranth|arrowhead|arrowroot|balsam|borage|breadfruit|breadnut|burdock|butterbur|cardoon|carissa|celtuce|cherimoya|chicory|cornsalad|cottonseed|crabapple|cowpea|broadbean|\\bjute\\b|lambsquarter|lotus|mamey|mammy|nance|pokeberry|prickly|purslane|sapodilla|sesbania|soursop|sweetsop|tamarind|tapioca|yardlong|waxgourd|winged bean|zealand|\\bpoi\\b|jew|kanpyo|lupin|moth bean|mothbean|mung|pigeon pea|rice bean|hyacinth|palm|carob|cusk|roe|caviar|shark|roughy|sturgeon|whitefish|burbot|\\bsmelt\\b|sucker|pompano|mullet|\\bshad\\b|wahoo|\\bscup\\b|croaker|dolphinfish|kingklip|rockfish|whiting|lingcod|sablefish|cisco|butterfish|bluefish|carp\\b|escolar|ocean perch|snapper|grouper|tilefish|spiny|abalone|\\bconch|cuttlefish|squid|octopus|whelk|turtle|\\bsnail|\\bfrog|game|\\bbison|\\belk\\b|\\bdeer\\b|moose|buffalo|beefalo|ostrich|\\bemu\\b|goose|duck|pheasant|quail|pigeon|squab|rabbit|\\bseal\\b|\\bwhale\\b|walrus|caribou|\\bhorse\\b|raccoon|opossum|\\bbear\\b|muskrat|beaver|squirrel|candies|candy|chocolate|wheat,|teff|spelt|sorghum|triticale|\\bgrain|backfat|\\bskin|\\bmeal|extender|broth|\\bspot\\b|sheepshead|\\bling\\b|flatfish|guinea|okara|natto|milkfish|monkfish|surimi|cassava|chrysanthemum|celeriac|jujube|java-plum|feijoa|horned|ginkgo|carambola|elderberr|currants|coriander|chives|wasabi|pickled|hocks|dark meat|uncooked|sprouted|defatted|commercial|flower clusters|\\bleaves|stalks|garland|catsup|papad|miso|buckwheat|barley|millet|\\brye|flaxseed|candied|almond paste|corn pudding|salvadoran|boiled drained|mexican blend|fresh-refrigerated|spinach|peanuts?,|soybean|curd|haddock|swordfish|mahimahi|turkey|\\bcoconut|cherry juice|cranberry juice|grapefruit juice|\\bfish\\b|beet greens|raab|chinese|napa|mustard|savoy|\\bburrito|pulled pork|potato salad|chapati|hummus|adzuki|navy beans|pink beans|small white|yellow beans|canadian bacon|pork,|chicken,|\\bdock\\b|eppaw|gourd|oheloberr|epazote|peel|topping|fiddlehead|dandelion|drumstick|jerusalem|\\bcress|vegetarian|vermicelli|\\btofu|gjetost|caraway|tilsit|port de salut|limburger|neufchatel|queso|cranberry beans|french beans|pink or red|lemon grass|loquat|longan|oranges, florida|litchis|mulberr|kumquat|kohlrabi|endive|ginger root|casaba|lemon juice|lime juice|sunflower|tempeh|dessert|molasses|marie biscuit|matzo|fortune|gingersnap|fig bars|sandwich cookies|cinnamon buns|wild rice|cheese crackers", 'i');
const REORDER = new Set(['cheese', 'bread', 'cake', 'cookies', 'crackers', 'pie', 'soup', 'juice', 'pudding', 'muffins', 'sandwich', 'salad', 'noodles', 'tortillas', 'rolls', 'pancakes', 'waffles', 'pastry', 'doughnuts', 'bagels', 'biscuits', 'beans', 'peppers', 'peas', 'lentils', 'rice', 'pasta', 'milk', 'yogurt', 'cream', 'candies']);
const DROP_FIRST = new Set(['nuts', 'seeds', 'fish', 'crustaceans', 'mollusks', 'snacks', 'beverages', 'fast foods', 'cereals ready-to-eat', 'restaurant', 'sweets', 'vegetables', 'fruit']);
const NOISE = /^(raw|cooked|boiled|drained|prepared|plain|whole|regular|fresh|ready-to-eat|ready-to-serve|ready to eat|commercially prepared|without salt|with salt|mature seeds|all varieties|all types|all commercial varieties|unsalted|salted|baked|broiled|roasted|fried|grilled|stewed|steamed|microwaved|pan-fried|home-prepared|home prepared|restaurant|from restaurant|with skin|without skin|flesh|meat only|meat and skin|chopped|sliced|cubed|pieces|diced|mashed|solids and liquids|undrained|heated|toasted|dry heat|moist heat|average|firm|soft|medium|large|small|cooked, boiled, drained|boiled\. drained|boiled, drained, without salt|boiled, drained, with salt|immature seeds|mature|canned|commercially|home-made|enriched|made with|made from)$/i;

function friendly(desc) {
  const clean = (x) => x.replace(/\([^)]*\)/g, '').replace(/[.;]/g, '').replace(/\s+/g, ' ').trim();
  const parts = desc.split(',').map(clean).filter((x) => x && !NOISE.test(x));
  if (parts.length === 0 || parts.length > 2) return null;
  const first = parts[0].toLowerCase();
  let label;
  if (parts.length === 1) label = parts[0];
  else if (DROP_FIRST.has(first)) label = parts[1];
  else if (REORDER.has(first)) label = `${parts[1]} ${first}`;
  else label = `${parts[0]}, ${parts[1].toLowerCase()}`;
  label = label.replace(/\s+/g, ' ').replace(/,$/, '').trim();
  if (label.length < 3 || label.length > 30 || /\d|[;:&]/.test(label)) return null;
  if (REORDER.has(label.toLowerCase()) || DROP_FIRST.has(label.toLowerCase()) || label.toLowerCase() === 'beans') return null;
  return label[0].toUpperCase() + label.slice(1).toLowerCase();
}
/** Brand names show up as capitalised words in the middle of a USDA description. Skip them. */
const looksBranded = (d) => /[A-Z]{3,}/.test(d) || /[a-z] [A-Z]/.test(d) || /['’]/.test(d);

const perCat = new Map();
const picked = [];
const seenKeys = new Set();
const idOf = (label, fdc) => 'usda_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 36);
for (const f of all) {
  if (!WANT.has(f.cat)) continue;
  if (looksBranded(f.name) || DENY.test(f.name) || f.name.split(',').length > 4 || f.name.length > 70) continue;
  if (f.grams <= 0 || f.kcal > 1100) continue;
  const label = friendly(f.name);
  if (!label) continue;
  const key = norm(label);
  if (existingNames.has(key) || seenKeys.has(key)) continue;
  const id = idOf(label, f.id);
  if (existing.has(id)) continue;
  if ((perCat.get(f.cat) ?? 0) >= 24) continue;
  seenKeys.add(key);
  existing.add(id);
  perCat.set(f.cat, (perCat.get(f.cat) ?? 0) + 1);
  picked.push({ id, label, f });
}
picked.sort((a, b) => a.label.localeCompare(b.label));
console.log(`[usda] ${picked.length} foods for photo recognition`);

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const srv = (s) => esc(s.length > 36 ? s.slice(0, 36).trim() : s);
const lines = picked.map(({ id, label, f }) => `  ['${id}', '${esc(label)}', ${f.grams}, '${srv(f.serving)}', ${f.kcal}, ${f.protein}, ${f.carbs}, ${f.fat}],`);
writeFileSync(
  join(root, 'src', 'nutrition', 'usda.ts'),
  `import type { Food } from './foods';

/**
 * Common foods from the USDA FoodData Central "SR Legacy" data (public domain, CC0 1.0), picked and renamed so a
 * photo model can tell them apart. GENERATED by scripts/build-usda-foods.mjs: do not edit by hand.
 * Source: https://fdc.nal.usda.gov/. Numbers are USDA averages for a typical serving of the food in general,
 * not for a particular product, and are shown to people as estimates.
 */
type Row = [id: string, name: string, grams: number, serving: string, kcal: number, protein: number, carbs: number, fat: number];

const ROWS: Row[] = [
${lines.join('\n')}
];

export const USDA_FOODS: readonly Food[] = ROWS.map(([id, name, grams, serving, kcal, protein, carbs, fat]) => ({ id, name, grams, serving, kcal, protein, carbs, fat }));
`,
);
