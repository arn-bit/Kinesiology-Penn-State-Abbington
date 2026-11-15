import { parseLesson, type Lesson } from './compare';

/**
 * Lessons and practice scores live in this browser's localStorage under the `mw:` prefix, so
 * "Delete all my data" removes them too. Only skeleton points are stored, never video or photos.
 */
export const LESSONS_KEY = 'mw:lessons:v1';
export const MAX_LESSONS = 12;
export const MAX_FILE_BYTES = 1_500_000;

export interface Attempt {
  at: string;
  score: number;
}

export interface LessonStore {
  lessons: Lesson[];
  attempts: Record<string, Attempt[]>;
}

export const emptyStore = (): LessonStore => ({ lessons: [], attempts: {} });

export function parseStore(raw: unknown): LessonStore {
  const out = emptyStore();
  if (typeof raw !== 'object' || raw === null) return out;
  const o = raw as { lessons?: unknown; attempts?: unknown };
  if (Array.isArray(o.lessons)) {
    const seen = new Set<string>();
    for (const l of o.lessons) {
      const p = parseLesson(l);
      if (p && !seen.has(p.id) && out.lessons.length < MAX_LESSONS) {
        seen.add(p.id);
        out.lessons.push(p);
      }
    }
  }
  if (typeof o.attempts === 'object' && o.attempts !== null) {
    for (const [id, list] of Object.entries(o.attempts as Record<string, unknown>)) {
      if (!out.lessons.some((l) => l.id === id) || !Array.isArray(list)) continue;
      out.attempts[id] = list
        .filter((a): a is Attempt => typeof a === 'object' && a !== null && typeof (a as Attempt).at === 'string' && typeof (a as Attempt).score === 'number' && Number.isFinite((a as Attempt).score))
        .map((a) => ({ at: a.at.slice(0, 40), score: Math.max(0, Math.min(100, Math.round(a.score))) }))
        .slice(-30);
    }
  }
  return out;
}

export function loadLessons(storage: Pick<Storage, 'getItem'> = globalThis.localStorage): LessonStore {
  try {
    const text = storage.getItem(LESSONS_KEY);
    return text ? parseStore(JSON.parse(text)) : emptyStore();
  } catch {
    return emptyStore();
  }
}

/** Returns false when the browser would not keep it (storage full or blocked). */
export function saveLessons(s: LessonStore, storage: Pick<Storage, 'setItem'> = globalThis.localStorage): boolean {
  try {
    storage.setItem(LESSONS_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export type AddResult = { ok: true; store: LessonStore } | { ok: false; reason: string };

export function addLesson(s: LessonStore, lesson: Lesson): AddResult {
  if (s.lessons.length >= MAX_LESSONS) return { ok: false, reason: `You can keep up to ${MAX_LESSONS} lessons. Delete one first.` };
  const lessons = [...s.lessons.filter((l) => l.id !== lesson.id), lesson];
  return { ok: true, store: { ...s, lessons } };
}

export function removeLesson(s: LessonStore, id: string): LessonStore {
  const { [id]: _gone, ...attempts } = s.attempts;
  void _gone;
  return { lessons: s.lessons.filter((l) => l.id !== id), attempts };
}

export function addAttempt(s: LessonStore, id: string, score: number, at = new Date()): LessonStore {
  const list = [...(s.attempts[id] ?? []), { at: at.toISOString(), score: Math.max(0, Math.min(100, Math.round(score))) }].slice(-30);
  return { ...s, attempts: { ...s.attempts, [id]: list } };
}

export function bestScore(s: LessonStore, id: string): number | null {
  const list = s.attempts[id];
  return list?.length ? Math.max(...list.map((a) => a.score)) : null;
}

/** Read a lesson file someone shared. */
export function importLessonText(text: string): { ok: true; lesson: Lesson } | { ok: false; reason: string } {
  if (text.length > MAX_FILE_BYTES) return { ok: false, reason: 'That file is too large to be a lesson.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'That file is not a lesson file.' };
  }
  const lesson = parseLesson(raw);
  return lesson ? { ok: true, lesson } : { ok: false, reason: 'That file is not a valid lesson.' };
}

export function exportLessonText(l: Lesson): string {
  return JSON.stringify(l);
}
