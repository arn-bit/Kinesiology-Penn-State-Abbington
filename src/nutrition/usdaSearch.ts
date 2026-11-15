import type { Food } from './foods';

/**
 * The big food list: about 7,400 foods from USDA FoodData Central (SR Legacy, public domain, CC0 1.0).
 * It is a plain file on this site (public/data/usda-foods.json) that is only fetched the first time you search,
 * so it adds nothing to the app's start-up. Nothing about what you search for leaves the device.
 */
export const USDA_CREDIT = 'Nutrition values from USDA FoodData Central (SR Legacy), a public-domain source. They are averages for the food in general, not a particular product.';
export const USDA_URL = '/data/usda-foods.json';
export const USDA_PREFIX = 'usda:';

type Row = [id: number, name: string, serving: string, grams: number, kcal: number, protein: number, carbs: number, fat: number];

/** Check a downloaded file and turn it into foods. Anything malformed is dropped rather than trusted. */
export function parseUsda(raw: unknown): Food[] {
  const list = typeof raw === 'object' && raw !== null ? (raw as { foods?: unknown }).foods : null;
  if (!Array.isArray(list)) throw new Error('The food list is not in the expected format.');
  const out: Food[] = [];
  const seen = new Set<number>();
  for (const r of list as unknown[]) {
    if (!Array.isArray(r) || r.length < 8) continue;
    const [id, name, serving, grams, kcal, protein, carbs, fat] = r as Row;
    if (!Number.isInteger(id) || seen.has(id) || typeof name !== 'string' || typeof serving !== 'string') continue;
    if (![grams, kcal, protein, carbs, fat].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) continue;
    seen.add(id);
    out.push({ id: `${USDA_PREFIX}${id}`, name: name.slice(0, 90), grams, serving: serving.slice(0, 60) || '100 g', kcal, protein, carbs, fat });
  }
  return out;
}

let cache: Promise<Food[]> | null = null;

/** Fetch the list once; later calls reuse it. A failure is not remembered, so searching again retries. */
export function loadUsda(fetcher: typeof fetch = fetch): Promise<Food[]> {
  cache ??= fetcher(USDA_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`The food list could not be loaded (${res.status}).`);
      return res.json();
    })
    .then(parseUsda)
    .catch((e) => {
      cache = null;
      throw e;
    });
  return cache;
}

/** Foods whose name contains every word typed, best matches first (names that start with the search come first). */
export function searchUsda(foods: readonly Food[], query: string, limit = 40): Food[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  if (words.join('').length < 2) return [];
  const hits: { f: Food; rank: number }[] = [];
  for (const f of foods) {
    const name = f.name.toLowerCase();
    if (!words.every((w) => name.includes(w))) continue;
    const rank = name.startsWith(words[0]!) ? 0 : name.includes(`, ${words[0]!}`) ? 1 : 2;
    hits.push({ f, rank });
  }
  hits.sort((a, b) => a.rank - b.rank || a.f.name.length - b.f.name.length || a.f.name.localeCompare(b.f.name));
  return hits.slice(0, limit).map((h) => h.f);
}

/** For tests: forget the loaded list. */
export function resetUsdaCache() {
  cache = null;
}
