import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_FOODS } from './foods';
import { loadUsda, parseUsda, resetUsdaCache, searchUsda } from './usdaSearch';

const file = JSON.parse(readFileSync('public/data/usda-foods.json', 'utf8')) as unknown;

describe('the USDA food list', () => {
  const foods = parseUsda(file);

  it('is a large, clean list with a public-domain credit', () => {
    expect(foods.length).toBeGreaterThan(6000);
    expect((file as { licence: string }).licence).toMatch(/CC0/);
    expect((file as { source: string }).source).toMatch(/FoodData Central/);
    expect(new Set(foods.map((f) => f.id)).size).toBe(foods.length);
    for (const f of foods) {
      expect(f.id.startsWith('usda:')).toBe(true);
      for (const n of [f.kcal, f.protein, f.carbs, f.fat, f.grams]) expect(Number.isFinite(n) && n >= 0).toBe(true);
      expect(f.kcal).toBeLessThanOrEqual(1500);
    }
  });

  it('leaves out baby food, branded products and alcohol', () => {
    expect(foods.some((f) => /^alcoholic beverage/i.test(f.name))).toBe(false);
    expect(foods.some((f) => /^babyfood/i.test(f.name))).toBe(false);
  });

  it('has sensible numbers for a familiar food', () => {
    const cheddar = foods.find((f) => /^cheese, cheddar$/i.test(f.name))!;
    expect(cheddar).toBeDefined();
    expect(cheddar.kcal).toBeGreaterThan(80);
    expect(cheddar.protein).toBeGreaterThan(4);
    const est = 4 * cheddar.protein + 4 * cheddar.carbs + 9 * cheddar.fat;
    expect(Math.abs(cheddar.kcal - est)).toBeLessThan(25);
  });

  it('every food has energy that roughly matches its macros', () => {
    const off = foods.filter((f) => f.kcal > 20 && Math.abs(f.kcal - (4 * f.protein + 4 * f.carbs + 9 * f.fat)) > Math.max(40, f.kcal * 0.35));
    expect(off.length / foods.length).toBeLessThan(0.03);
  });
});

describe('searching it', () => {
  const foods = parseUsda(file);
  it('needs every word and ranks names that start with your search first', () => {
    const r = searchUsda(foods, 'cheddar');
    expect(r.length).toBeGreaterThan(2);
    expect(r.every((f) => /cheddar/i.test(f.name))).toBe(true);
    const two = searchUsda(foods, 'cheese cheddar');
    expect(two.every((f) => /cheese/i.test(f.name) && /cheddar/i.test(f.name))).toBe(true);
    expect(searchUsda(foods, 'apples')[0]!.name.toLowerCase().startsWith('apples')).toBe(true);
  });

  it('ignores one-letter searches, finds nothing for nonsense, and respects the limit', () => {
    expect(searchUsda(foods, 'a')).toEqual([]);
    expect(searchUsda(foods, '   ')).toEqual([]);
    expect(searchUsda(foods, 'qqzzxx')).toEqual([]);
    expect(searchUsda(foods, 'raw', 5)).toHaveLength(5);
  });
});

describe('loading and checking the file', () => {
  it('drops malformed rows instead of trusting them', () => {
    const f = parseUsda({ foods: [[1, 'Good food', '1 cup', 100, 100, 1, 2, 3], [1, 'Duplicate id', '1 cup', 100, 100, 1, 2, 3], [2, 5, '1 cup', 1, 1, 1, 1, 1], [3, 'Negative', '1 cup', 1, -5, 1, 1, 1], [4, 'Short'], 'junk', null, [5, 'NaN food', '1 cup', 1, Number.NaN, 1, 1, 1]] });
    expect(f.map((x) => x.name)).toEqual(['Good food']);
    expect(() => parseUsda(null)).toThrow();
    expect(() => parseUsda({ foods: 'no' })).toThrow();
  });

  it('fetches once, reuses it, and retries after a failure', async () => {
    resetUsdaCache();
    let calls = 0;
    const ok = (async () => {
      calls++;
      return new Response(JSON.stringify({ foods: [[9, 'Test food', '1 cup', 100, 90, 1, 20, 0]] }), { status: 200 });
    }) as typeof fetch;
    const a = await loadUsda(ok);
    const b = await loadUsda(ok);
    expect(a).toBe(b);
    expect(calls).toBe(1);
    resetUsdaCache();
    await expect(loadUsda((async () => new Response('nope', { status: 500 })) as typeof fetch)).rejects.toThrow(/500/);
    const again = await loadUsda(ok);
    expect(again).toHaveLength(1);
    resetUsdaCache();
  });
});

describe('the recognisable food list after the cuisine expansion', () => {
  it('has more than 1,300 foods with unique ids and names', () => {
    expect(ALL_FOODS.length).toBeGreaterThan(1300);
    expect(new Set(ALL_FOODS.map((f) => f.id)).size).toBe(ALL_FOODS.length);
    expect(new Set(ALL_FOODS.map((f) => f.name.toLowerCase())).size).toBeGreaterThan(ALL_FOODS.length - 15);
  });

  it('covers each of the requested cuisines with real dishes', () => {
    const has = (id: string) => ALL_FOODS.some((f) => f.id === id);
    for (const id of ['cacio_e_pepe', 'quiche_lorraine', 'szechuan_beef', 'chicken_katsu', 'carne_asada', 'masala_dosa', 'paella_valenciana', 'moussaka_greek', 'red_curry', 'iskender', 'aji_de_gallina', 'shish_taouk', 'bun_bo_hue', 'galbi', 'chicken_tagine', 'feijoada_completa', 'buffalo_wings', 'doro_wat', 'chelo_kabab', 'curry_goat', 'sauerbraten', 'asado', 'soto_ayam', 'kare_kare', 'egusi_soup', 'beef_stroganoff', 'cuban_sandwich', 'bacalhau_a_bras', 'nihari', 'swedish_meatballs']) {
      expect(has(id), id).toBe(true);
    }
  });

  it('every food has sensible numbers', () => {
    for (const f of ALL_FOODS) {
      for (const n of [f.kcal, f.protein, f.carbs, f.fat, f.grams]) expect(Number.isFinite(n) && n >= 0, f.id).toBe(true);
      expect(f.kcal, f.id).toBeLessThanOrEqual(1500);
    }
  });
});
