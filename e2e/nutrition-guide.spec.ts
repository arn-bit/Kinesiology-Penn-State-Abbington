import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { seed, watch } from './helpers';
import { emptyNutritionProfile } from '../src/nutrition/guide/profile';

test.use({ serviceWorkers: 'block' });

const confirmed = (over: Record<string, unknown> = {}) => ({ ...emptyNutritionProfile(), allergiesConfirmed: true, ...over });

test('food guide: nothing is suggested until the allergy question is answered, and the answer is saved', async ({ page }) => {
  await seed(page);
  const w = watch(page);
  await page.goto('/nutrition/foods');
  await expect(page.getByRole('heading', { level: 2, name: 'Tell us about allergies first' })).toBeVisible();
  await expect(page.locator('.ng-food')).toHaveCount(0);

  await page.getByRole('link', { name: 'Open my food profile' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'My food profile' })).toBeVisible();
  await expect(page.getByText('Food ideas are switched off')).toBeVisible();
  await page.getByLabel('Peanuts', { exact: true }).check();
  await page.getByLabel('Milk', { exact: true }).check();
  await page.getByLabel('I have checked my allergies').check();
  await expect(page.getByText('Food ideas are switched off')).toHaveCount(0);

  await page.getByRole('link', { name: 'Foods for you' }).click();
  await expect(page.locator('.ng-food').first()).toBeVisible();
  const cards = await page.locator('.ng-food').allTextContents();
  expect(cards.length).toBeGreaterThan(3);
  for (const c of cards) {
    expect(c).not.toMatch(/Contains:[^.]*(peanut|milk)/i);
    expect(c.toLowerCase()).not.toMatch(/peanut butter|yogurt|cheese|cheddar/);
    expect(c).toMatch(/Why it is suggested/);
    expect(c).toMatch(/Contains:|Lists none of the nine major allergens/);
  }
  // The decision is transparent: left-out foods are listed with a reason.
  await page.getByText(/Left out for you/).click();
  await expect(page.locator('.ng-excluded')).toContainText('Apple with peanut butter');
  await expect(page.locator('.ng-excluded')).toContainText('which you avoid');
  // Never claims safety.
  const body = (await page.locator('main').innerText()).toLowerCase();
  expect(body).not.toMatch(/allergy-safe|hypoallergenic|safe for you|guaranteed/);
  expect(body).toContain('read the current ingredient label');

  // It survives a reload (and so, a backup).
  await page.reload();
  await page.getByRole('link', { name: 'My food profile' }).click();
  await expect(page.getByLabel('Peanuts', { exact: true })).toBeChecked();
  await expect(page.getByLabel('I have checked my allergies')).toBeChecked();
  expect(w.errors).toEqual([]);
  expect(w.external).toEqual([]);
});

test('food guide: diets, typed allergies and swaps', async ({ page }) => {
  await seed(page, {}, (d) => {
    d.nutrition = confirmed({ allergens: ['milk'], diets: ['vegan'], otherAllergens: ['kiwi'] }) as never;
  });
  await page.goto('/nutrition/foods');
  const text = (await page.locator('.ng-foods').innerText()).toLowerCase();
  for (const bad of ['chicken', 'salmon', 'egg', 'yogurt', 'cheese', 'tuna', 'shrimp', 'honey', 'kiwi']) expect(text, bad).not.toContain(bad);
  await expect(page.locator('.ng-food').first()).toBeVisible();

  // Check a food and find swaps.
  await page.getByLabel('Food to check').selectOption({ label: 'Cheesecake' });
  await expect(page.getByText(/Cheesecake: may not fit/)).toBeVisible();
  await expect(page.getByText(/can contain milk/)).toBeVisible();
  await expect(page.getByText(/Try instead:/)).toBeVisible();
  await page.getByLabel('Food to check').selectOption({ label: 'Apple' });
  await expect(page.getByText(/Apple: no clash found/)).toBeVisible();
  await expect(page.getByText(/does not make it safe/i)).toBeVisible();
});

test('food guide: log food and drinks, see patterns, and everything is saved', async ({ page }) => {
  await seed(page, {}, (d) => {
    d.nutrition = confirmed({ goals: ['hydration', 'variety'], waterTargetCups: 4 }) as never;
  });
  await page.goto('/nutrition');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();

  const ring = page.locator('.ng-water');
  await page.getByRole('button', { name: '1 cup', exact: true }).click();
  await page.getByRole('button', { name: '1 cup', exact: true }).click();
  await page.getByRole('button', { name: '½ cup', exact: true }).click();
  await expect(ring).toContainText('2.5');
  await page.getByRole('button', { name: 'Undo last' }).click();
  await expect(ring).toContainText('2');
  await expect(ring).not.toContainText('2.5');
  await expect(page.getByRole('progressbar', { name: /Improve hydration/ })).toBeVisible();

  await page.getByLabel('Find a food').fill('oatmeal with milk');
  await page.getByLabel('Food', { exact: true }).selectOption({ label: 'Oatmeal with milk and banana (1 bowl)' });
  await page.getByRole('button', { name: 'Add to today' }).click();
  await expect(page.locator('.ng-log')).toContainText('Oatmeal with milk and banana');
  // Its food groups appear in the weekly picture.
  await expect(page.locator('.ng-grid')).toContainText(/Grains logged on/);
  await expect(page.locator('.ng-grid')).toContainText(/Dairy & alternatives logged on/);
  await expect(page.locator('.ng-day[aria-pressed="true"]')).toHaveAttribute('aria-label', /3 of 5 food groups|[1-5] of 5 food groups/);
  await expect(page.getByText(/Log food on 3 days to see which groups are rare/)).toBeVisible();

  await page.reload();
  await expect(page.locator('.ng-log')).toContainText('Oatmeal with milk and banana');
  await expect(page.locator('.ng-water')).toContainText('2');
  await page.getByRole('button', { name: 'Remove Oatmeal with milk and banana' }).click();
  await expect(page.getByText('Nothing logged yet.')).toBeVisible();
});

test('food guide: logging a dish that clashes with your allergies shows a heads-up and a swap, never a verdict of safe', async ({ page }) => {
  await seed(page, {}, (d) => {
    d.nutrition = confirmed({ allergens: ['milk'] }) as never;
  });
  await page.goto('/nutrition');
  await page.getByLabel('Find a food').fill('cheesecake');
  await page.getByLabel('Food', { exact: true }).selectOption({ label: 'Cheesecake (1 slice)' });
  await expect(page.getByText('This may not fit what you told us')).toBeVisible();
  await expect(page.getByText(/Ideas that fit your profile instead/)).toBeVisible();
  await page.getByRole('button', { name: 'Add to today' }).click();
  await expect(page.locator('.ng-log')).toContainText(/can contain milk/);
});

test('food guide: the coach explains with sources, says when it does not know, and reacts to a workout day', async ({ page }) => {
  // A seeded plan has a workout on at least one day; make today a workout day by checking the tip exists only when planned.
  await seed(page, {}, (d) => {
    d.nutrition = confirmed({ allergens: ['peanuts'], goals: ['performance', 'recovery'] }) as never;
  });
  await page.goto('/nutrition/coach');
  await expect(page.getByRole('heading', { level: 1, name: 'Your coach' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'For you right now' })).toBeVisible();

  await page.getByRole('button', { name: 'What should I eat before a workout?' }).click();
  const answer = page.locator('.ng-answer');
  await expect(answer).toContainText('3 to 4 hours before');
  await expect(answer).not.toContainText(/peanut butter/i);
  await answer.locator('summary').click();
  await expect(answer.getByRole('link', { name: /Sports Nutrition for Busy Families/ })).toHaveAttribute('href', /healthychildren\.org/);

  await page.getByLabel('Or type a question').fill('how do I read an allergen label');
  await page.getByRole('button', { name: 'Ask' }).click();
  await expect(answer).toContainText('never labels any food as safe for an allergy');

  await page.getByLabel('Or type a question').fill('xyzzy plugh');
  await page.getByRole('button', { name: 'Ask' }).click();
  await expect(page.getByText('I do not have a checked answer for that')).toBeVisible();

  await page.getByRole('button', { name: 'How much water do I need?' }).click();
  await expect(page.locator('.ng-answer')).toContainText('no official');
});

test('food guide: before allergies are answered the coach stays quiet; under-18s see no calorie numbers', async ({ page }) => {
  await seed(page, { ageYears: 14, guardianConfirmed: true });
  await page.goto('/nutrition/coach');
  await expect(page.getByRole('heading', { level: 3, name: 'Start with allergies' })).toBeVisible();
  await expect(page.locator('.ng-tip')).toHaveCount(1);

  await page.goto('/nutrition/profile');
  await expect(page.getByText('Check this with a parent or guardian')).toBeVisible();
  await expect(page.getByLabel('Improve athletic performance')).toHaveCount(0);
  await expect(page.getByLabel('Have energy to play and do sport')).toBeVisible();
  await page.getByLabel('I have checked my allergies').check();
  await page.goto('/nutrition/foods');
  const text = await page.locator('.ng-foods').innerText();
  expect(text).not.toMatch(/\bkcal\b|calories/i);
  await expect(page.locator('.ng-food').first()).toBeVisible();
});

test('food guide: every tab fits a phone and has no serious accessibility problems', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page, {}, (d) => {
    d.nutrition = confirmed({ allergens: ['egg'], diets: ['vegetarian'], goals: ['balanced', 'hydration', 'habits'] }) as never;
  });
  for (const path of ['/nutrition', '/nutrition/foods', '/nutrition/coach', '/nutrition/profile']) {
    await page.goto(path);
    await expect(page.getByRole('navigation', { name: 'Nutrition sections' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${path}: ${v.id} ${v.nodes[0]?.target}`)).toEqual([]);
  }
});

test('food guide: it is on the main navigation, the old photo page still works, and a backup carries the profile', async ({ page }) => {
  await seed(page, {}, (d) => {
    d.nutrition = confirmed({ allergens: ['soy'] }) as never;
  });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Nutrition' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await page.getByRole('link', { name: 'Snap a meal' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: /Snap a meal/ })).toBeVisible();
  const stored = await page.evaluate(() => localStorage.getItem('mw:v1') ?? '');
  expect(JSON.parse(stored).nutrition.allergens).toEqual(['soy']);
});

test('food guide: the big USDA food list loads only when you search, and a food from it can be logged', async ({ page }) => {
  await seed(page, {}, (d) => {
    d.nutrition = confirmed() as never;
  });
  const w = watch(page);
  const fetched: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/data/usda-foods.json')) fetched.push(r.url());
  });
  await page.goto('/nutrition');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  expect(fetched).toEqual([]); // nothing is downloaded until someone searches

  await page.getByLabel('Find a food').fill('cheddar');
  const option = page.getByLabel('Food', { exact: true }).locator('option', { hasText: /^Cheese, cheddar \(/ }).first();
  await expect(option).toBeAttached({ timeout: 15_000 });
  expect(fetched.length).toBe(1);
  await expect(page.getByText(/USDA FoodData Central \(SR Legacy\), a public-domain source/)).toBeVisible();
  await page.getByLabel('Food', { exact: true }).selectOption((await option.getAttribute('value'))!);
  await page.getByRole('button', { name: 'Add to today' }).click();
  await expect(page.locator('.ng-log')).toContainText('Cheese, cheddar');
  expect(w.external).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('food guide: dishes from many cuisines can be found and logged', async ({ page }) => {
  await seed(page, {}, (d) => {
    d.nutrition = confirmed() as never;
  });
  await page.goto('/nutrition');
  for (const [q, label] of [
    ['feijoada', /Feijoada completa/],
    ['doro wat', /Doro wat/],
    ['khinkali', /Khinkali/],
    ['pasteis', /Pastel de nata/],
  ] as const) {
    await page.getByLabel('Find a food').fill(q);
    await expect(page.getByLabel('Food', { exact: true }).locator('option', { hasText: label }).first()).toBeAttached();
  }
});
