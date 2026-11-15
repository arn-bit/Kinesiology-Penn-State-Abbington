import { describe, expect, it } from 'vitest';
import { makeBody } from '../pose/testing/simulate';
import { LM } from '../pose/geometry';
import { Recorder, SAMPLE_MS, anchorOf, compare, featuresOf, finishLesson, jointAdvice, matchScore, packFrame, paceNote, parseLesson, placeGhost, poseAt, type PackedFrame } from './compare';
import { addAttempt, addLesson, bestScore, emptyStore, exportLessonText, importLessonText, loadLessons, parseStore, removeLesson, saveLessons, MAX_LESSONS } from './store';

const ASPECT = 4 / 3;

/** A squat-like clip: knees bend from `top` to `bottom` and back, `reps` times, one frame per SAMPLE_MS. */
function squatClip(opts: { reps?: number; framesPerRep?: number; top?: number; bottom?: number; lead?: number; arms?: number } = {}) {
  const { reps = 3, framesPerRep = 30, top = 172, bottom = 95, lead = 0, arms = 20 } = opts;
  const angles: number[] = Array(lead).fill(top);
  for (let r = 0; r < reps; r++) {
    for (let i = 0; i < framesPerRep; i++) {
      const x = i / framesPerRep;
      const k = x < 0.5 ? x * 2 : (1 - x) * 2;
      angles.push(top - (top - bottom) * k);
    }
  }
  const p: PackedFrame[] = angles.map((a) => packFrame(makeBody({ view: 'front', kneeAngle: a, shoulderAngle: arms }), ASPECT)!);
  const t = p.map((_, i) => i * SAMPLE_MS);
  return { t, p };
}

describe('packing a camera frame', () => {
  it('centres on the hips and scales by torso length', () => {
    const p = packFrame(makeBody({ view: 'front' }), ASPECT)!;
    expect(p).toHaveLength(39);
    // Hips are the centre, so the two hip x values are mirror images and the average y is ~0.
    const lx = p[7 * 3]!;
    const rx = p[8 * 3]!;
    expect(Math.abs(lx + rx)).toBeLessThan(0.01);
    expect((p[7 * 3 + 1]! + p[8 * 3 + 1]!) / 2).toBeCloseTo(0, 2);
    // Shoulders sit about one torso length above the hips (y grows downward).
    expect((p[1 * 3 + 1]! + p[2 * 3 + 1]!) / 2).toBeCloseTo(-1, 1);
  });

  it('refuses a frame whose torso is not visible', () => {
    expect(packFrame(null, ASPECT)).toBeNull();
    expect(packFrame(makeBody({ hidden: [LM.leftHip] }), ASPECT)).toBeNull();
  });

  it('puts a ghost where the student stands and keeps its shape', () => {
    const body = makeBody({ view: 'front', kneeAngle: 120 });
    const p = packFrame(body, ASPECT)!;
    const anchor = anchorOf(body, ASPECT)!;
    const ghost = placeGhost(p, anchor, ASPECT);
    for (const lm of [LM.leftKnee, LM.rightWrist, LM.nose]) {
      expect(ghost[lm]!.x).toBeCloseTo(body[lm]!.x, 2);
      expect(ghost[lm]!.y).toBeCloseTo(body[lm]!.y, 2);
    }
    // A student standing elsewhere and smaller gets the ghost there, smaller.
    const moved = placeGhost(p, { cx: 0.3, cy: 0.4, torso: anchor.torso / 2 }, ASPECT);
    expect(moved[LM.leftHip]!.x).toBeLessThan(0.45);
    expect(Math.abs(moved[LM.leftKnee]!.y - moved[LM.leftHip]!.y)).toBeLessThan(Math.abs(ghost[LM.leftKnee]!.y - ghost[LM.leftHip]!.y));
  });

  it('measures knee and elbow angles', () => {
    const f = featuresOf(packFrame(makeBody({ view: 'front', kneeAngle: 110 }), ASPECT)!);
    const straight = featuresOf(packFrame(makeBody({ view: 'front', kneeAngle: 170 }), ASPECT)!);
    expect(f[6]).toBeLessThan(straight[6]! - 20);
    expect(f[6]).toBeGreaterThan(60);
  });
});

describe('scoring one angle', () => {
  it('is free for small differences and falls to zero', () => {
    expect(matchScore(0)).toBe(1);
    expect(matchScore(6)).toBe(1);
    expect(matchScore(-6)).toBe(1);
    expect(matchScore(30)).toBeGreaterThan(0.3);
    expect(matchScore(30)).toBeLessThan(0.7);
    expect(matchScore(50)).toBe(0);
    expect(matchScore(Number.NaN)).toBe(0);
  });
});

describe('comparing a student with a teacher', () => {
  const teacher = squatClip();

  it('gives a near-perfect score for the same movement', () => {
    const r = compare(teacher, squatClip())!;
    expect(r.score).toBeGreaterThanOrEqual(97);
    expect(r.grade).toBe('excellent');
    expect(r.pace).toBeGreaterThan(0.9);
    expect(r.pace).toBeLessThan(1.1);
    expect(r.weakestAtMs).toBeNull();
  });

  it('does not punish starting late', () => {
    const r = compare(teacher, squatClip({ lead: 15 }))!;
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it('does not punish moving slower, and reports it', () => {
    const slow = squatClip({ framesPerRep: 45 });
    const r = compare(teacher, slow)!;
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.pace).toBeGreaterThan(1.25);
    expect(paceNote(r.pace)).toMatch(/slower/);
    const fast = compare(teacher, squatClip({ framesPerRep: 20 }))!;
    expect(fast.pace).toBeLessThan(0.8);
    expect(paceNote(fast.pace)).toMatch(/faster/);
  });

  it('scores a shallow squat lower and names the knees', () => {
    const r = compare(teacher, squatClip({ bottom: 140 }))!;
    expect(r.score).toBeLessThan(85);
    expect(r.score).toBeGreaterThan(30);
    expect(r.joints[0]!.label).toMatch(/knee/i);
    expect(r.joints[0]!.meanDiff).toBeGreaterThan(5); // straighter than the teacher
    expect(jointAdvice(r.joints[0]!)).toMatch(/straighter/);
  });

  it('says "more bent" when the knees bend too far', () => {
    const r = compare(squatClip({ bottom: 130 }), squatClip({ bottom: 80 }))!;
    const knee = r.joints.find((j) => /knee/i.test(j.label))!;
    expect(knee.meanDiff).toBeLessThan(0);
    expect(jointAdvice(knee)).toMatch(/more bent/);
  });

  it('scores standing still low and flags a weak moment', () => {
    const still = squatClip({ bottom: 172 });
    const r = compare(teacher, still)!;
    expect(r.score).toBeLessThan(75);
    expect(r.score).toBeLessThan(compare(teacher, squatClip())!.score);
  });

  it('notices the wrong arms', () => {
    const r = compare(teacher, squatClip({ arms: 100 }))!;
    expect(r.score).toBeLessThan(96);
    expect(r.joints[0]!.label).toMatch(/shoulder/i);
  });

  it('returns a timeline and reports tracking', () => {
    const r = compare(teacher, squatClip(), 120)!;
    expect(r.timeline.length).toBeGreaterThan(10);
    expect(r.timeline.every((x) => x >= 0 && x <= 100)).toBe(true);
    expect(r.tracked).toBeCloseTo(90 / 120, 2);
  });

  it('refuses to compare almost nothing', () => {
    expect(compare(teacher, { t: [0, 1], p: teacher.p.slice(0, 2) })).toBeNull();
  });
});

describe('recording', () => {
  it('keeps about one frame per sample and skips frames where the body is lost', () => {
    const rec = new Recorder();
    const good = makeBody({ view: 'front' });
    for (let ms = 0; ms < 2000; ms += 20) rec.add(ms >= 1000 && ms < 1400 ? null : good, 1000 + ms, ASPECT);
    expect(rec.p.length).toBeGreaterThan(14);
    expect(rec.p.length).toBeLessThan(20);
    expect(rec.trackedShare).toBeLessThan(1);
    expect(rec.trackedShare).toBeGreaterThan(0.7);
    expect(rec.t[0]).toBe(0);
  });

  it('stops at the time limit', () => {
    const rec = new Recorder(1000);
    const good = makeBody();
    expect(rec.add(good, 0, ASPECT)).toBe(true);
    expect(rec.add(good, 900, ASPECT)).toBe(true);
    expect(rec.add(good, 1200, ASPECT)).toBe(false);
  });

  it('makes a lesson only from a long enough, tracked recording', () => {
    expect(finishLesson('Short', { t: [0, 100], p: [packFrame(makeBody(), ASPECT)!, packFrame(makeBody(), ASPECT)!] })).toBeNull();
    const clip = squatClip();
    const lesson = finishLesson('  Squats  ', clip)!;
    expect(lesson.name).toBe('Squats');
    expect(lesson.durationMs).toBeGreaterThan(8000);
    expect(lesson.t[0]).toBe(0);
    expect(finishLesson('', clip)!.name).toBe('Untitled lesson');
  });

  it('finds the pose to show at a time', () => {
    const clip = squatClip();
    expect(poseAt(clip, 0)).toBe(clip.p[0]);
    expect(poseAt(clip, 250)).toBe(clip.p[2]);
    expect(poseAt(clip, 1e9)).toBe(clip.p[clip.p.length - 1]);
  });
});

describe('checking a lesson file', () => {
  const lesson = finishLesson('Squats', squatClip())!;
  it('accepts a lesson that went through JSON', () => {
    expect(parseLesson(JSON.parse(JSON.stringify(lesson)))?.name).toBe('Squats');
  });
  it('rejects anything malformed', () => {
    expect(parseLesson(null)).toBeNull();
    expect(parseLesson({ ...lesson, v: 2 })).toBeNull();
    expect(parseLesson({ ...lesson, id: '../x' })).toBeNull();
    expect(parseLesson({ ...lesson, t: lesson.t.slice(1) })).toBeNull();
    expect(parseLesson({ ...lesson, p: lesson.p.map((f) => f.slice(1)) })).toBeNull();
    expect(parseLesson({ ...lesson, p: [...lesson.p.slice(1), [...lesson.p[0]!.slice(1), Number.NaN]] })).toBeNull();
    expect(parseLesson({ ...lesson, t: lesson.t.map((x) => x * 100) })).toBeNull();
    expect(parseLesson({ ...lesson, t: [...lesson.t].reverse() })).toBeNull();
    expect(parseLesson({ ...lesson, t: lesson.t.slice(0, 30), p: lesson.p.slice(0, 30) })).toBeNull();
  });
});

describe('saving lessons on this device', () => {
  const lesson = finishLesson('Squats', squatClip())!;

  it('adds, scores, shares and removes', () => {
    let s = emptyStore();
    const added = addLesson(s, lesson);
    expect(added.ok).toBe(true);
    s = added.ok ? added.store : s;
    expect(s.lessons).toHaveLength(1);
    expect(bestScore(s, lesson.id)).toBeNull();
    s = addAttempt(addAttempt(s, lesson.id, 61.4), lesson.id, 88.6);
    expect(bestScore(s, lesson.id)).toBe(89);
    const back = importLessonText(exportLessonText(lesson));
    expect(back.ok && back.lesson.id).toBe(lesson.id);
    s = removeLesson(s, lesson.id);
    expect(s.lessons).toHaveLength(0);
    expect(s.attempts[lesson.id]).toBeUndefined();
  });

  it('limits how many lessons you keep', () => {
    let s = emptyStore();
    for (let i = 0; i < MAX_LESSONS; i++) {
      const r = addLesson(s, { ...lesson, id: `id${i}` });
      if (r.ok) s = r.store;
    }
    expect(s.lessons).toHaveLength(MAX_LESSONS);
    expect(addLesson(s, { ...lesson, id: 'one-more' }).ok).toBe(false);
  });

  it('explains a bad file', () => {
    expect(importLessonText('not json')).toMatchObject({ ok: false });
    expect(importLessonText('{"v":1}')).toMatchObject({ ok: false });
    expect(importLessonText('x'.repeat(2_000_000))).toMatchObject({ ok: false });
  });

  it('survives storage that fails or holds junk', () => {
    expect(loadLessons({ getItem: () => 'junk' }).lessons).toEqual([]);
    expect(loadLessons({ getItem: () => { throw new Error('blocked'); } }).lessons).toEqual([]);
    expect(saveLessons(emptyStore(), { setItem: () => { throw new Error('full'); } })).toBe(false);
    const kept: Record<string, string> = {};
    expect(saveLessons({ lessons: [lesson], attempts: { [lesson.id]: [{ at: 'x', score: 70 }] } }, { setItem: (k, v) => (kept[k] = v) })).toBe(true);
    const loaded = loadLessons({ getItem: (k) => kept[k] ?? null });
    expect(loaded.lessons[0]!.id).toBe(lesson.id);
    expect(loaded.attempts[lesson.id]).toHaveLength(1);
    expect(parseStore({ lessons: [lesson], attempts: { nope: [{ at: 'x', score: 5 }] } }).attempts).toEqual({});
  });
});
