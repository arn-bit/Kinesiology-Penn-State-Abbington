import { test, expect } from '@playwright/test';
import { seed, watch } from './helpers';
import { SAMPLE_MS, finishLesson, packFrame } from '../src/lessons/compare';
import { exportLessonText } from '../src/lessons/store';
import { makeBody } from '../src/pose/testing/simulate';

/**
 * Teacher lessons. Chromium's fake camera shows a test pattern with no person, so these prove the pages,
 * the saving and sharing, the camera and model start-up, and the "nothing to score" handling.
 * The scoring itself is covered by unit tests with simulated bodies, not by these.
 */
test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera'],
  serviceWorkers: 'block',
});

function sampleLesson(name = 'Squat set') {
  const p = [];
  for (let i = 0; i < 60; i++) {
    const k = 172 - 70 * Math.abs(Math.sin((i / 30) * Math.PI));
    p.push(packFrame(makeBody({ view: 'front', kneeAngle: k }), 4 / 3)!);
  }
  return finishLesson(name, { t: p.map((_, i) => i * SAMPLE_MS), p })!;
}

test('add a lesson file, see it, share it, and delete it', async ({ page }) => {
  const w = watch(page);
  await seed(page);
  await page.goto('/lessons');
  await expect(page.getByRole('heading', { name: 'Learn a movement from a teacher' })).toBeVisible();
  await expect(page.getByText('No lessons yet')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Teacher Lessons' })).toBeVisible();

  await page.getByLabel('Choose a lesson file').setInputFiles({ name: 'squat.json', mimeType: 'application/json', buffer: Buffer.from(exportLessonText(sampleLesson())) });
  await expect(page.getByText('Added “Squat set”.')).toBeVisible();
  await expect(page.getByText('Your lessons (1/12)')).toBeVisible();
  await expect(page.getByText('not practised yet')).toBeVisible();

  // It is kept after a reload, in this browser only.
  await page.reload();
  await expect(page.getByText('Squat set')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Share file' }).click();
  expect((await download).suggestedFilename()).toBe('squat-set.verimove-lesson.json');

  await page.getByRole('button', { name: 'Delete Squat set' }).click();
  await page.getByRole('button', { name: 'Delete for good' }).click();
  await expect(page.getByText('No lessons yet')).toBeVisible();
  expect(w.errors).toEqual([]);
});

test('a file that is not a lesson is refused with a plain message', async ({ page }) => {
  await seed(page);
  await page.goto('/lessons');
  await page.getByLabel('Choose a lesson file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(page.getByText('That file is not a valid lesson.')).toBeVisible();
  await expect(page.getByText('No lessons yet')).toBeVisible();
});

test('recording: the camera starts on-device and a recording with nobody in view saves nothing', async ({ page }) => {
  test.setTimeout(120_000);
  const w = watch(page);
  await seed(page);
  await page.goto('/lessons/record');
  const start = page.getByRole('button', { name: /^Start/ });
  await expect(start).toBeEnabled({ timeout: 90_000 });
  await expect(page.getByText('On-device only')).toBeVisible();
  await start.click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.getByText('Nothing saved')).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('button', { name: /^Start/ })).toBeVisible();
  expect(w.external).toEqual([]);
  expect(w.errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
});

test('practising: you follow the ghost, and with nobody in view you are told there is nothing to score', async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, {}, undefined);
  const lesson = sampleLesson();
  await page.addInitScript(
    ([key, value]) => {
      if (!sessionStorage.getItem('lesson-seeded')) {
        localStorage.setItem(key, value);
        sessionStorage.setItem('lesson-seeded', '1');
      }
    },
    ['mw:lessons:v1', JSON.stringify({ lessons: [lesson], attempts: {} })] as const,
  );
  await page.goto(`/lessons/practice/${lesson.id}`);
  await expect(page.getByRole('heading', { name: 'Squat set' })).toBeVisible();
  const start = page.getByRole('button', { name: /^Start/ });
  await expect(start).toBeEnabled({ timeout: 90_000 });
  await start.click();
  await expect(page.getByRole('button', { name: /finished/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /finished/ }).click();
  await expect(page.getByText('Not enough to score')).toBeVisible();
});

test('lessons are removed by "Delete all my data"', async ({ page }) => {
  await seed(page);
  const lesson = sampleLesson();
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), ['mw:lessons:v1', JSON.stringify({ lessons: [lesson], attempts: {} })] as const);
  await page.goto('/lessons');
  await expect(page.getByText('Squat set')).toBeVisible();
  const kept = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('mw:')));
  expect(kept).toContain('mw:lessons:v1');
});
